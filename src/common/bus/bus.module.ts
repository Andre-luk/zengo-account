import { Global, Module } from '@nestjs/common';
import { AlertEventBus } from '@common/bus/alert-event.bus';
import { InterventionEventBus } from '@common/bus/intervention-event.bus';
import { TelephonyEventBus } from '@common/bus/telephony-event.bus';

/**
 * Bus applicatifs globaux.
 *
 * Volontairement sans dependance : n'importe quel module peut publier ou
 * s'abonner sans creer de cycle dans le graphe de modules.
 */
@Global()
@Module({
  providers: [AlertEventBus, TelephonyEventBus, InterventionEventBus],
  exports: [AlertEventBus, TelephonyEventBus, InterventionEventBus],
})
export class BusModule {}
