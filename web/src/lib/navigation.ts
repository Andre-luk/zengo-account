import {
  ArrowRightLeft,
  BellRing,
  Building2,
  Coins,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  RadioTower,
  ScrollText,
  ShieldCheck,
  Siren,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@/types/api';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Roles autorises. Tableau vide = tous les utilisateurs connectes. */
  roles?: Role[];
  /** Groupement visuel dans la barre laterale. */
  group: 'supervision' | 'gestion' | 'administration';
  description?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/tableau-de-bord',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    group: 'supervision',
    description: "Vue d'ensemble du parc et des alertes",
  },
  {
    to: '/alertes',
    label: 'Alertes',
    icon: BellRing,
    group: 'supervision',
    description: "File d'attente du Zengo Monitoring Center",
  },
  {
    to: '/missions',
    label: 'Missions',
    icon: Siren,
    group: 'supervision',
    description: 'Equipes engagees, suivi GPS et rapports',
  },
  {
    to: '/simulation',
    label: "Banc d'essai",
    icon: RadioTower,
    roles: ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'PLATFORM_MANAGER', 'OPERATOR', 'SUPERVISOR'],
    group: 'supervision',
    description: 'Jouer un kit installé : déclencher une intrusion et répondre à l appel',
  },
  {
    to: '/abonnements',
    label: 'Abonnements',
    icon: KeyRound,
    group: 'gestion',
    description: 'Encaissements, codes clients et echeances',
  },
  {
    to: '/mutations',
    label: 'Mutations',
    icon: ArrowRightLeft,
    group: 'gestion',
    description: 'Transferts de portefeuille entre agences',
  },
  {
    to: '/clients',
    label: 'Comptes clients',
    icon: Users,
    roles: [
      'SUPER_ADMIN',
      'NATIONAL_DIRECTOR',
      'TECHNICAL_DIRECTOR',
      'PLATFORM_MANAGER',
      'REGION_MANAGER',
      'AGENCY_MANAGER',
      'ACCOUNTANT',
      'OPERATOR',
      'SUPERVISOR',
    ],
    group: 'gestion',
    description: 'Fiches clients, equipements et abonnements',
  },
  {
    to: '/sante',
    label: 'Sante connectee',
    icon: HeartPulse,
    group: 'gestion',
    roles: ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'HEALTH_STAFF'],
    description: 'Mesures, consentements et demandes de soin',
  },
  {
    to: '/dispositifs',
    label: 'Parc SafAlert',
    icon: ShieldCheck,
    group: 'gestion',
    description: 'Centrales, sous-appareils et armement',
  },
  {
    to: '/tarifs',
    label: 'Tarification',
    icon: Coins,
    roles: [
      'SUPER_ADMIN',
      'NATIONAL_DIRECTOR',
      'TECHNICAL_DIRECTOR',
      'DAF',
      'ACCOUNTANT',
      'PLATFORM_MANAGER',
      'REGION_MANAGER',
      'AGENCY_MANAGER',
    ],
    group: 'administration',
    description: 'Packs, boutons SOS et taux USD/CDF',
  },
  {
    to: '/organisations',
    label: 'Organisation',
    icon: Building2,
    roles: [
      'SUPER_ADMIN',
      'NATIONAL_DIRECTOR',
      'TECHNICAL_DIRECTOR',
      'PLATFORM_MANAGER',
      'REGION_MANAGER',
      'AGENCY_MANAGER',
    ],
    group: 'administration',
    description: 'Zones, agences et stations',
  },
  {
    to: '/utilisateurs',
    label: 'Utilisateurs',
    icon: LifeBuoy,
    roles: [
      'SUPER_ADMIN',
      'NATIONAL_DIRECTOR',
      'TECHNICAL_DIRECTOR',
      'PLATFORM_MANAGER',
      'REGION_MANAGER',
      'AGENCY_MANAGER',
    ],
    group: 'administration',
    description: 'Comptes, roles et habilitations',
  },
  {
    to: '/journal',
    label: "Journal d'audit",
    icon: ScrollText,
    roles: ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'QUALITY_DIRECTOR', 'DAF'],
    group: 'administration',
    description: 'Traçabilité des actions sensibles',
  },
];

export const NAV_GROUPS: Array<{ id: NavItem['group']; label: string }> = [
  { id: 'supervision', label: 'Supervision' },
  { id: 'gestion', label: 'Gestion' },
  { id: 'administration', label: 'Administration' },
];

/** Titre affiche dans l'en-tete pour chaque route. */
export const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/tableau-de-bord': { title: 'Tableau de bord', subtitle: 'Supervision temps réel du parc SafAlert' },
  '/alertes': { title: 'Alertes', subtitle: 'Zengo Monitoring Center' },
  '/missions': { title: 'Missions', subtitle: 'Equipes terrain, suivi GPS et rapports' },
  '/mutations': { title: 'Mutations géographiques', subtitle: 'Transferts de dossiers clients entre agences' },
  '/sante': { title: 'Santé connectée', subtitle: 'Mesures préventives, consentements et demandes de soin' },
  '/clients': { title: 'Comptes clients', subtitle: 'Fiches Zengo, equipements et abonnements' },
  '/dispositifs': { title: 'Parc SafAlert', subtitle: 'Centrales et sous-appareils' },
  '/tarifs': { title: 'Tarification', subtitle: 'Packs, boutons SOS et taux de change' },
  '/organisations': { title: 'Organisation', subtitle: 'Hiérarchie nationale, zones et agences' },
  '/utilisateurs': { title: 'Utilisateurs', subtitle: 'Comptes et habilitations' },
  '/journal': { title: "Journal d'audit", subtitle: 'Historique des actions' },
};
