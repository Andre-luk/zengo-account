import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ArmMode, SubDeviceCode } from '@common/enums/device.enum';
/** Scenario pret a l'emploi du banc d'essai : un libelle clair -> un capteur. */
export enum SimulationScenario {
  INTRUSION_DOOR = 'INTRUSION_DOOR',
  INTRUSION_MOTION = 'INTRUSION_MOTION',
  FIRE_SMOKE = 'FIRE_SMOKE',
  GAS_LEAK = 'GAS_LEAK',
  WATER_LEAK = 'WATER_LEAK',
  PANIC_BUTTON = 'PANIC_BUTTON',
}

/** Scenario -> code de sous-appareil tel que le protocole du kit le transmet. */
export const SCENARIO_SUB_DEVICE: Record<SimulationScenario, SubDeviceCode> = {
  [SimulationScenario.INTRUSION_DOOR]: SubDeviceCode.DC,
  [SimulationScenario.INTRUSION_MOTION]: SubDeviceCode.PIR,
  [SimulationScenario.FIRE_SMOKE]: SubDeviceCode.WSD,
  [SimulationScenario.GAS_LEAK]: SubDeviceCode.GLS,
  [SimulationScenario.WATER_LEAK]: SubDeviceCode.WLS,
  [SimulationScenario.PANIC_BUTTON]: SubDeviceCode.CON,
};

/** Message par defaut, identique a celui qu'enverrait le materiel. */
export const SCENARIO_MESSAGE: Record<SimulationScenario, string> = {
  [SimulationScenario.INTRUSION_DOOR]: "Ouverture de porte detectee pendant l'armement.",
  [SimulationScenario.INTRUSION_MOTION]: "Mouvement detecte dans la piece pendant l'armement.",
  [SimulationScenario.FIRE_SMOKE]: 'Fumee detectee : verification immediate recommandee.',
  [SimulationScenario.GAS_LEAK]: 'Fuite de gaz detectee : risque d explosion.',
  [SimulationScenario.WATER_LEAK]: "Fuite d'eau detectee dans le logement.",
  [SimulationScenario.PANIC_BUTTON]: "Bouton d'alerte / telecommande actionne par l occupant.",
};

/** Etats de capteur proposes par le banc d'essai. */
export const SIMULATED_DEVICE_STATES = ['NORMAL', 'OPEN', 'TAMPER', 'LOW_BATTERY'] as const;
export type SimulatedDeviceState = (typeof SIMULATED_DEVICE_STATES)[number];

export class SimulateAlarmDto {
  @ApiPropertyOptional({ enum: SimulationScenario, description: "Scenario pret a l'emploi." })
  @IsOptional()
  @IsEnum(SimulationScenario)
  scenario?: SimulationScenario;

  @ApiPropertyOptional({ enum: SubDeviceCode, description: 'Capteur precis a declencher.' })
  @IsOptional()
  @IsEnum(SubDeviceCode)
  subDeviceCode?: SubDeviceCode;

  @ApiPropertyOptional({ description: 'Message du capteur, journalise tel quel.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;

  @ApiPropertyOptional({ description: 'Declencher l appel vocal IA de verification.' })
  @IsOptional()
  @IsBoolean()
  autoVoiceCall?: boolean;
}

export class SimulateHeartbeatDto {
  @ApiPropertyOptional({ enum: SubDeviceCode, description: 'Capteur concerne (defaut : la porte).' })
  @IsOptional()
  @IsEnum(SubDeviceCode)
  subDeviceCode?: SubDeviceCode;

  @ApiPropertyOptional({ enum: SIMULATED_DEVICE_STATES, description: 'Etat declare du capteur.' })
  @IsOptional()
  @IsIn(SIMULATED_DEVICE_STATES)
  state?: SimulatedDeviceState;

  @ApiPropertyOptional({ description: 'Version de firmware annoncee par le kit.', example: 1002 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999999)
  firmwareVersion?: number;
}

export class SimulateArmModeDto {
  @ApiProperty({ enum: ArmMode, description: "Mode d'armement annonce par le kit." })
  @IsEnum(ArmMode)
  armMode!: ArmMode;
}
