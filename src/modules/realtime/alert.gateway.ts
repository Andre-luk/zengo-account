import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { AlertEventBus, AlertRealtimeEvent } from '@common/bus/alert-event.bus';
import { HealthEventBus, HealthRealtimeEvent } from '@common/bus/health-event.bus';
import { InterventionEventBus, InterventionRealtimeEvent } from '@common/bus/intervention-event.bus';
import { MutationEventBus, MutationRealtimeEvent } from '@common/bus/mutation-event.bus';
import { NATIONAL_SCOPE_ROLES } from '@common/enums/role.enum';
import { AccessTokenPayload } from '@common/interfaces/authenticated-user.interface';
import { UsersService } from '@modules/users/users.service';

const NATIONAL_ROOM = 'national';
const roomFor = (organizationId: string): string => `org:${organizationId}`;

/**
 * Diffusion temps reel des alertes vers les consoles (ZMC, stations, mobile).
 *
 * Securite : le client presente son JWT dans `handshake.auth.token` (jamais en
 * parametre d'URL, ou il finirait dans les journaux). Il est ensuite place dans
 * les salles correspondant a ses appartenances ; seules les alertes de son
 * perimetre lui sont poussees.
 *
 * Authentification socket.io plutot que SSE : le navigateur peut envoyer un
 * en-tete d'authentification, et le canal reste extensible (accuses de
 * reception, positions des equipes).
 */
@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class AlertGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertGateway.name);
  private subscription: Subscription | null = null;
  private interventionSubscription: Subscription | null = null;
  private mutationSubscription: Subscription | null = null;
  private healthSubscription: Subscription | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly alertEventBus: AlertEventBus,
    private readonly interventionEventBus: InterventionEventBus,
    private readonly mutationEventBus: MutationEventBus,
    private readonly healthEventBus: HealthEventBus,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.alertEventBus.subscribe((event) => this.broadcast(event));
    this.interventionSubscription = this.interventionEventBus.subscribe((event) => this.broadcastIntervention(event));
    this.mutationSubscription = this.mutationEventBus.subscribe((event) => this.broadcastMutation(event));
    this.healthSubscription = this.healthEventBus.subscribe((event) => this.broadcastHealth(event));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.interventionSubscription?.unsubscribe();
    this.mutationSubscription?.unsubscribe();
    this.healthSubscription?.unsubscribe();
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.reject(client, 'TOKEN_MISSING');
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.get<string>('app.jwt.accessSecret'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        this.reject(client, 'USER_NOT_FOUND');
        return;
      }

      const authenticated = await this.usersService.toAuthenticatedUser(user);
      const rooms = new Set<string>();

      for (const membership of authenticated.memberships) {
        rooms.add(roomFor(membership.organizationId));
      }
      if (authenticated.isSuperAdmin || authenticated.roles.some((role) => NATIONAL_SCOPE_ROLES.has(role))) {
        rooms.add(NATIONAL_ROOM);
      }
      if (rooms.size === 0) {
        this.reject(client, 'NO_SCOPE');
        return;
      }

      await client.join([...rooms]);
      client.data.userId = authenticated.id;
      client.data.rooms = [...rooms];

      client.emit('ready', {
        userId: authenticated.id,
        rooms: [...rooms],
        serverTime: new Date().toISOString(),
      });

      this.logger.log(`Console connectee (${authenticated.id}) - ${rooms.size} salle(s).`);
    } catch {
      this.reject(client, 'INVALID_TOKEN');
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Console deconnectee (${client.data?.userId ?? client.id}).`);
  }

  /** Pousse l'evenement dans toutes les salles concernees. */
  private broadcast(event: AlertRealtimeEvent): void {
    if (!this.server) return;

    const rooms = event.organizationIds.length > 0 ? event.organizationIds : [NATIONAL_ROOM];
    const targets = rooms.map((room) => (room === NATIONAL_ROOM ? NATIONAL_ROOM : roomFor(room)));

    this.server.to(targets).emit(event.type, event);
  }

  /** Diffusion des missions terrain (affectation, avancement, cloture, retard). */
  private broadcastIntervention(event: InterventionRealtimeEvent): void {
    if (!this.server) return;

    const rooms = event.organizationIds.length > 0 ? event.organizationIds : [NATIONAL_ROOM];
    const targets = rooms.map((room) => (room === NATIONAL_ROOM ? NATIONAL_ROOM : roomFor(room)));

    this.server.to(targets).emit(event.type, event);
  }

  /**
   * Diffusion des mutations geographiques.
   *
   * L'evenement part vers les deux agences concernees et la salle nationale :
   * l'agence d'origine doit voir partir le dossier, l'agence d'accueil doit
   * savoir qu'elle le reprend, et la direction suit l'ensemble.
   */
  private broadcastMutation(event: MutationRealtimeEvent): void {
    if (!this.server) return;

    const rooms = [event.fromOrganizationId, event.toOrganizationId].filter(
      (id): id is string => Boolean(id),
    );
    const targets = rooms.length > 0 ? rooms.map(roomFor) : [NATIONAL_ROOM];
    if (!targets.includes(NATIONAL_ROOM)) targets.push(NATIONAL_ROOM);

    this.server.to(targets).emit(event.type, event);
  }

  /**
   * Diffusion d'un evenement de sante.
   *
   * Les donnees de sante sont sensibles : la diffusion reste limitee a
   * l'organisation du client et a la salle nationale (personnel habilite), et
   * ne transporte qu'un resume — aucune valeur n'est exposee cote console.
   */
  private broadcastHealth(event: HealthRealtimeEvent): void {
    if (!this.server) return;

    const targets = [NATIONAL_ROOM];
    if (event.organizationId) targets.push(roomFor(event.organizationId));

    this.server.to(targets).emit(event.type, event);
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
    return null;
  }

  private reject(client: Socket, reason: string): void {
    client.emit('unauthorized', { reason });
    client.disconnect(true);
  }

  /** Nombre de consoles connectees (sonde de supervision). */
  connectedClients(): number {
    return this.server?.sockets?.sockets?.size ?? 0;
  }
}
