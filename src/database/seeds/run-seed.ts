/**
 * Jeu de donnees initial (idempotent) :
 *   - arborescence nationale / regions / agences / stations
 *   - groupes tarifaires du cahier des charges
 *   - comptes utilisateurs de reference (direction, plateforme, agence, technicien)
 *   - equipes d'intervention terrain par station (iteration 3)
 *   - jeu de demonstration (client + dispositif + sous-appareils)
 *
 * Usage : npm run seed
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Language, OfferPack } from '@common/enums/client.enum';
import { FieldTeamStatus } from '@common/enums/intervention.enum';
import { OrganizationType, StationType } from '@common/enums/organization.enum';
import { Role } from '@common/enums/role.enum';
import { ArmMode, SubDeviceCode } from '@common/enums/device.enum';
import { ClientStatus } from '@common/enums/client.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { FieldTeam } from '@database/entities/field-team.entity';
import { Organization } from '@database/entities/organization.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { User } from '@database/entities/user.entity';
import { AppModule } from '../../app.module';
import { OrganizationsService } from '@modules/organizations/organizations.service';
import { UsersService } from '@modules/users/users.service';
import { ClientsService } from '@modules/clients/clients.service';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@zengo.cd';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Zengo@2026';
const DEMO_ENABLED = (process.env.SEED_DEMO ?? 'true').toLowerCase() !== 'false';

interface TariffSeed {
  code: string;
  name: string;
  offerPack: OfferPack;
  registrationFeeUsd: number;
  monthlyFeeUsd: number;
  description: string;
  features: Record<string, unknown>;
}

const TARIFF_GROUPS: TariffSeed[] = [
  {
    code: 'STANDARD',
    name: 'Standard - Particuliers / Foyers',
    offerPack: OfferPack.STANDARD,
    registrationFeeUsd: 150,
    monthlyFeeUsd: 22,
    description:
      '3 types d alertes (intrusion, feu, urgence medicale), appel vocal IA, application Zengo Account.',
    features: {
      alerts: ['INTRUSION', 'FIRE', 'MEDICAL'],
      aiVoiceCall: true,
      camera: false,
      multiSite: false,
    },
  },
  {
    code: 'PREMIUM_SMALL',
    name: 'Premium Pack Small - Petits commerces',
    offerPack: OfferPack.PREMIUM_SMALL,
    registrationFeeUsd: 350,
    monthlyFeeUsd: 25,
    description: 'Surveillance basique + camera, appel vocal + notification mobile.',
    features: {
      alerts: ['INTRUSION', 'FIRE', 'MEDICAL'],
      aiVoiceCall: true,
      camera: true,
      multiSite: false,
    },
  },
  {
    code: 'PREMIUM_INSTITUTION',
    name: 'Premium Pack Institutions - Ecoles, eglises, hopitaux',
    offerPack: OfferPack.PREMIUM_INSTITUTION,
    registrationFeeUsd: 700,
    monthlyFeeUsd: 30,
    description:
      'Multi-niveaux d alerte, video IA, capteurs multipoints, gestion multi-site, rapports et archivage.',
    features: {
      alerts: ['INTRUSION', 'FIRE', 'MEDICAL', 'SABOTAGE'],
      aiVoiceCall: true,
      camera: true,
      multiSite: true,
      multiUser: true,
      slaSupport: '24/7',
    },
  },
  {
    code: 'CUSTOM',
    name: 'Sur-mesure - Entreprises et industries',
    offerPack: OfferPack.CUSTOM,
    registrationFeeUsd: 0,
    monthlyFeeUsd: 50,
    description: 'Integration specifique, modules personnalises, evaluation technique et logistique.',
    features: { custom: true },
  },
];

const EXCHANGE_RATE_USD_TO_CDF = Number(process.env.SEED_USD_CDF_RATE ?? 2800);

async function main(): Promise<void> {
  console.log('[seed] Initialisation du contexte applicatif...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  console.log('[seed] Schema synchronise, insertion des donnees...');

  const organizationsService = app.get(OrganizationsService);
  const usersService = app.get(UsersService);
  const clientsService = app.get(ClientsService);
  const tariffRepository = app.get<Repository<TariffGroup>>(getRepositoryToken(TariffGroup));
  const usersRepository = app.get<Repository<User>>(getRepositoryToken(User));
  const devicesRepository = app.get<Repository<Device>>(getRepositoryToken(Device));
  const subDevicesRepository = app.get<Repository<SubDevice>>(getRepositoryToken(SubDevice));
  const clientsRepository = app.get<Repository<ClientProfile>>(getRepositoryToken(ClientProfile));
  const fieldTeamsRepository = app.get<Repository<FieldTeam>>(getRepositoryToken(FieldTeam));
  const organizationsRepository = app.get<Repository<Organization>>(getRepositoryToken(Organization));

  const summary: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. Groupes tarifaires
  // ---------------------------------------------------------------------------
  for (const seed of TARIFF_GROUPS) {
    const existing = await tariffRepository.findOne({ where: { code: seed.code } });
    if (existing) continue;
    await tariffRepository.save(
      tariffRepository.create({
        code: seed.code,
        name: seed.name,
        offerPack: seed.offerPack,
        description: seed.description,
        registrationFeeUsd: seed.registrationFeeUsd.toFixed(2),
        monthlyFeeUsd: seed.monthlyFeeUsd.toFixed(2),
        includedSosButtons: 1,
        sosButtonUnitPriceUsd: '5.00',
        maxSosButtons: 10,
        exchangeRateUsdToCdf: EXCHANGE_RATE_USD_TO_CDF.toFixed(4),
        features: seed.features,
      }),
    );
    summary.push(`+ Groupe tarifaire ${seed.code} (${seed.registrationFeeUsd}$ + ${seed.monthlyFeeUsd}$/mois)`);
  }

  // ---------------------------------------------------------------------------
  // 2. Arborescence organisationnelle
  // ---------------------------------------------------------------------------
  const ensureOrganization = async (
    code: string,
    payload: Parameters<OrganizationsService['create']>[0],
  ): Promise<Organization> => {
    const existing = await organizationsService.findByCode(code);
    if (existing) {
      // Les organisations creees avant l'ajout de la geolocalisation sont
      // completees : le siege de l'agence sert de repere d'intervention.
      if (existing.latitude === null && payload.latitude !== undefined) {
        await organizationsRepository.update(existing.id, {
          latitude: payload.latitude,
          longitude: payload.longitude ?? null,
        });
        existing.latitude = payload.latitude;
        existing.longitude = payload.longitude ?? null;
      }
      return existing;
    }
    const created = await organizationsService.create(payload);
    summary.push(`+ Organisation ${created.code} - ${created.name}`);
    return created;
  };

  // Coordonnees des zones pilotes : elles servent de point de reference pour
  // l'affectation des equipes et l'orientation GPS des interventions.
  const PILOT_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
    Kinshasa: { latitude: -4.325, longitude: 15.322 },
    Lubumbashi: { latitude: -11.6609, longitude: 27.4794 },
    Kolwezi: { latitude: -10.7167, longitude: 25.4667 },
  };

  /** Adresse du client de demonstration, distincte de sa station de rattachement. */
  const DEMO_CLIENT_COORDINATES = {
    latitude: PILOT_COORDINATES.Lubumbashi.latitude + 0.031,
    longitude: PILOT_COORDINATES.Lubumbashi.longitude - 0.018,
  };

  const nationalCoordinates = PILOT_COORDINATES.Kinshasa;

  const national = await ensureOrganization('NAT', {
    name: 'Direction Generale - Onesha Global',
    code: 'NAT',
    type: OrganizationType.NATIONAL,
    city: 'Kinshasa',
    country: 'CD',
    latitude: nationalCoordinates.latitude,
    longitude: nationalCoordinates.longitude,
  });

  const regions: Record<string, Organization> = {};
  for (const region of [
    { code: 'KIN', name: 'Zone Regionale Kinshasa', city: 'Kinshasa' },
    { code: 'LUB', name: 'Zone Regionale Lubumbashi', city: 'Lubumbashi' },
    { code: 'KLZ', name: 'Zone Regionale Kolwezi', city: 'Kolwezi' },
  ]) {
    regions[region.code] = await ensureOrganization(region.code, {
      name: region.name,
      code: region.code,
      type: OrganizationType.REGION,
      parentId: national.id,
      city: region.city,
      country: 'CD',
      latitude: PILOT_COORDINATES[region.city]?.latitude,
      longitude: PILOT_COORDINATES[region.city]?.longitude,
    });
  }

  const agencies: Record<string, Organization> = {};
  for (const agency of [
    { code: 'KIN-AG01', name: 'Agence Kinshasa Gombe', region: 'KIN', city: 'Kinshasa' },
    { code: 'LUB-AG01', name: 'Agence Lubumbashi Centre', region: 'LUB', city: 'Lubumbashi' },
    { code: 'KLZ-AG01', name: 'Agence Kolwezi Ville', region: 'KLZ', city: 'Kolwezi' },
  ]) {
    agencies[agency.code] = await ensureOrganization(agency.code, {
      name: agency.name,
      code: agency.code,
      type: OrganizationType.AGENCY,
      parentId: regions[agency.region].id,
      city: agency.city,
      country: 'CD',
      latitude: PILOT_COORDINATES[agency.city]?.latitude,
      longitude: PILOT_COORDINATES[agency.city]?.longitude,
    });
  }

  // Stations de reception d'alertes : chaque agence (point de distribution)
  // dispose de ses stations incendie, medicale et intrusion — conformement aux
  // zones pilotes du cahier des charges.
  const stationKinds = [
    { suffix: 'FIRE', label: 'Incendie', type: StationType.FIRE },
    { suffix: 'MED', label: 'Medicale', type: StationType.MEDICAL },
    { suffix: 'INTR', label: 'Intrusion', type: StationType.INTRUSION },
  ];

  const stationsByAgency: Record<string, Record<string, Organization>> = {};
  for (const [agencyCode, agency] of Object.entries(agencies)) {
    const regionCode = agencyCode.split('-')[0];
    const agenceCoordinates = PILOT_COORDINATES[agency.city ?? ''] ?? nationalCoordinates;
    stationsByAgency[agencyCode] = {};
    for (const kind of stationKinds) {
      const stationCode = `SRA-${kind.suffix}-${regionCode}`;
      stationsByAgency[agencyCode][kind.type] = await ensureOrganization(stationCode, {
        name: `Station ${kind.label} ${agency.city ?? regionCode}`,
        code: stationCode,
        type: OrganizationType.STATION,
        stationType: kind.type,
        parentId: agency.id,
        city: agency.city ?? regionCode,
        country: 'CD',
        latitude: agenceCoordinates?.latitude,
        longitude: agenceCoordinates?.longitude,
      });
    }
  }

  const fireStation = stationsByAgency['KIN-AG01'][StationType.FIRE];

  // ---------------------------------------------------------------------------
  // 2 bis. Equipes d'intervention terrain (iteration 3)
  // ---------------------------------------------------------------------------
  // Chaque station dispose de deux equipes : une position initiale est posee
  // sur le centre-ville de l'agence (base de depart), decalee par equipe afin
  // que l'affectation automatique "la plus proche" soit pertinente en demo.
  const CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = PILOT_COORDINATES;

  const teamTemplates = [
    { key: 'ALPHA', name: 'Equipe Alpha', offset: 0, members: 4 },
    { key: 'BRAVO', name: 'Equipe Bravo', offset: 0.02, members: 3 },
  ];

  for (const stations of Object.values(stationsByAgency)) {
    for (const [stationType, station] of Object.entries(stations)) {
      const base =
        CITY_COORDINATES[station.city ?? ''] ?? { latitude: -4.325, longitude: 15.322 };

      for (const template of teamTemplates) {
        const existing = await fieldTeamsRepository.findOne({
          where: { stationId: station.id, name: template.name },
        });
        if (existing) continue;

        await fieldTeamsRepository.save(
          fieldTeamsRepository.create({
            name: template.name,
            code: `${station.code}-${template.key}`,
            stationId: station.id,
            speciality: stationType as StationType,
            status: FieldTeamStatus.AVAILABLE,
            leaderName: `Chef ${template.name.replace('Equipe ', '')}`,
            leaderPhone: '+243970255599',
            membersCount: template.members,
            vehiclePlate: `ZGO-${station.code.slice(-4)}-${template.key.slice(0, 2)}`,
            currentLatitude: base.latitude + template.offset,
            currentLongitude: base.longitude + template.offset,
            lastPositionAt: new Date(),
            notes: 'Equipe de demonstration (seed).',
          }),
        );
        summary.push(`+ Equipe ${template.name} - ${station.name}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Comptes utilisateurs de reference
  // ---------------------------------------------------------------------------
  const ensureUser = async (payload: {
    email: string;
    firstName: string;
    lastName: string;
    organizationId: string;
    role: Role;
    password: string;
    superAdmin?: boolean;
    preferredLanguage?: Language;
  }): Promise<User | null> => {
    const existing = await usersRepository.findOne({ where: { email: payload.email } });
    if (existing) {
      if (payload.superAdmin && !existing.isSuperAdmin) {
        await usersRepository.update(existing.id, { isSuperAdmin: true });
      }
      return existing;
    }

    const { user } = await usersService.create({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      password: payload.password,
      preferredLanguage: payload.preferredLanguage ?? Language.FRENCH,
      memberships: [{ organizationId: payload.organizationId, role: payload.role, isPrimary: true }],
    });

    if (payload.superAdmin) {
      await usersRepository.update(user.id, { isSuperAdmin: true });
    }

    summary.push(`+ Utilisateur ${payload.email} (${payload.role})`);
    return user;
  };

  await ensureUser({
    email: ADMIN_EMAIL,
    firstName: 'Jean-Luc',
    lastName: 'Takalashi',
    organizationId: national.id,
    role: Role.SUPER_ADMIN,
    password: ADMIN_PASSWORD,
    superAdmin: true,
  });

  await ensureUser({
    email: 'plateforme@zengo.cd',
    firstName: 'Responsable',
    lastName: 'Plateforme',
    organizationId: national.id,
    role: Role.PLATFORM_MANAGER,
    password: 'Zengo@2026',
  });

  await ensureUser({
    email: 'technique@zengo.cd',
    firstName: 'Direction',
    lastName: 'Technique',
    organizationId: national.id,
    role: Role.TECHNICAL_DIRECTOR,
    password: 'Zengo@2026',
  });

  await ensureUser({
    email: 'chef.kinshasa@zengo.cd',
    firstName: 'Chef',
    lastName: 'Agence Kinshasa',
    organizationId: agencies['KIN-AG01'].id,
    role: Role.AGENCY_MANAGER,
    password: 'Zengo@2026',
  });

  await ensureUser({
    email: 'technicien@zengo.cd',
    firstName: 'Agent',
    lastName: 'Technique',
    organizationId: agencies['KIN-AG01'].id,
    role: Role.TECHNICIAN,
    password: 'Zengo@2026',
  });

  await ensureUser({
    email: 'operateur.zmc@zengo.cd',
    firstName: 'Operateur',
    lastName: 'ZMC',
    organizationId: national.id,
    role: Role.OPERATOR,
    password: 'Zengo@2026',
  });

  await ensureUser({
    email: 'station.pompiers@zengo.cd',
    firstName: 'Agent',
    lastName: 'Station Incendie',
    organizationId: fireStation.id,
    role: Role.STATION_AGENT,
    password: 'Zengo@2026',
  });

  // ---------------------------------------------------------------------------
  // 4. Jeu de demonstration (client + dispositif + sous-appareils)
  // ---------------------------------------------------------------------------
  if (DEMO_ENABLED) {
    const demoSerial = '3003004fba2394';
    let device = await devicesRepository.findOne({ where: { serialNumber: demoSerial } });
    if (!device) {
      device = await devicesRepository.save(
        devicesRepository.create({
          serialNumber: demoSerial,
          model: 'SafAlert Solar G1',
          imei: '356938035643809',
          simNumber: '+243810000001',
          alarmPhoneNumber: '+243810000002',
          organizationId: agencies['LUB-AG01'].id,
          language: Language.FRENCH,
        }),
      );
      summary.push(`+ Dispositif ${demoSerial}`);
    }

    const demoPhone = '+243970000099';
    let demoClient = await clientsRepository.findOne({ where: { primaryPhone: demoPhone } });
    if (!demoClient) {
      const platformManager = await usersRepository.findOne({ where: { email: 'plateforme@zengo.cd' } });
      const standardTariff = await tariffRepository.findOne({ where: { code: 'STANDARD' } });
      const fallbackAdmin = platformManager
        ? null
        : await usersRepository.findOneOrFail({ where: { email: ADMIN_EMAIL } });
      // Les appartenances doivent etre chargees pour que le perimetre soit calcule.
      const actorEntity = await usersService.findByIdOrFail(
        (platformManager ?? fallbackAdmin)!.id,
      );
      const actor = await usersService.toAuthenticatedUser(actorEntity);

      const created = await clientsService.create(actor, {
        fullName: 'Client Demonstration',
        primaryPhone: demoPhone,
        secondaryPhone: '+243970000098',
        emergencyContactName: 'Contact Urgence',
        emergencyContactPhone: '+243970000097',
        preferredLanguage: Language.FRENCH,
        address: '12, avenue de la Paix',
        city: 'Lubumbashi',
        country: 'CD',
        // A environ 4 km de la station de rattachement : les missions de
        // demonstration affichent une distance et une ETA realistes.
        latitude: DEMO_CLIENT_COORDINATES.latitude,
        longitude: DEMO_CLIENT_COORDINATES.longitude,
        organizationId: agencies['LUB-AG01'].id,
        offerPack: OfferPack.STANDARD,
        tariffGroupId: standardTariff?.id,
        sosButtonCount: 3,
        loginEmail: 'client.demo@zengo.cd',
        loginPassword: 'Client@2026',
      });

      demoClient = created.client;
      summary.push(
        `+ Client demonstration ${demoClient.zengoId} (login client.demo@zengo.cd / Client@2026)`,
      );
      if (created.temporaryPassword) {
        summary.push(`  mot de passe genere : ${created.temporaryPassword}`);
      }
    }

    if (demoClient) {
      // Un client de demonstration confondu avec sa station afficherait 0 m et
      // 0 min sur une mission : on recale son adresse sur le repere de reference.
      const onStation =
        demoClient.latitude === PILOT_COORDINATES.Lubumbashi.latitude &&
        demoClient.longitude === PILOT_COORDINATES.Lubumbashi.longitude;
      if (onStation) {
        await clientsRepository.update(demoClient.id, {
          latitude: DEMO_CLIENT_COORDINATES.latitude,
          longitude: DEMO_CLIENT_COORDINATES.longitude,
        });
        demoClient.latitude = DEMO_CLIENT_COORDINATES.latitude;
        demoClient.longitude = DEMO_CLIENT_COORDINATES.longitude;
        summary.push('  -> adresse du client de demonstration repositionnee a 4 km de sa station');
      }
    }

    if (demoClient && !demoClient.device) {
      await devicesRepository.update(device.id, {
        clientId: demoClient.id,
        organizationId: demoClient.organizationId,
        armMode: ArmMode.AWAY,
      });
      await clientsRepository.update(demoClient.id, {
        installationDate: new Date(),
        status: ClientStatus.ACTIVE,
      });
      summary.push('  -> dispositif rattache au client de demonstration');
    }

    const existingSubDevices = await subDevicesRepository.count({ where: { deviceId: device.id } });
    if (existingSubDevices === 0) {
      await subDevicesRepository.save([
        subDevicesRepository.create({
          deviceId: device.id,
          subId: '00000040',
          name: 'Porte principale',
          areaName: 'Entree',
          code: SubDeviceCode.DC,
          state: '00000000',
        }),
        subDevicesRepository.create({
          deviceId: device.id,
          subId: '00411400',
          name: 'Detecteur salon',
          areaName: 'Salon',
          code: SubDeviceCode.PIR,
          state: '00000000',
        }),
        subDevicesRepository.create({
          deviceId: device.id,
          subId: '009fcbe0',
          name: 'Detecteur de fumee cuisine',
          areaName: 'Cuisine',
          code: SubDeviceCode.WSD,
          state: '00000000',
        }),
      ]);
      summary.push('+ 3 sous-appareils de demonstration');
    }
  }

  console.log('\n============================================================');
  console.log(' Seed termine');
  console.log('============================================================');
  if (summary.length === 0) {
    console.log(' Aucune modification (donnees deja presentes).');
  } else {
    for (const line of summary) console.log(line);
  }
  console.log('------------------------------------------------------------');
  console.log(' Comptes de connexion :');
  console.log(`   Super admin        : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('   Responsable platef.: plateforme@zengo.cd / Zengo@2026');
  console.log('   Direction technique: technique@zengo.cd / Zengo@2026');
  console.log('   Chef agence Kinsh. : chef.kinshasa@zengo.cd / Zengo@2026');
  console.log('   Technicien         : technicien@zengo.cd / Zengo@2026');
  console.log('   Operateur ZMC      : operateur.zmc@zengo.cd / Zengo@2026');
  console.log('   Agent station      : station.pompiers@zengo.cd / Zengo@2026');
  if (DEMO_ENABLED) {
    console.log('   Client demo        : client.demo@zengo.cd / Client@2026');
  }
  console.log('============================================================\n');

  await app.close();
}

main().catch((error) => {
  console.error('Echec du seed :', error);
  process.exit(1);
});