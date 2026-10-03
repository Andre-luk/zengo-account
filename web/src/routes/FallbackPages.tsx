import { Compass, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

const Shell = ({
  icon,
  code,
  title,
  description,
}: {
  icon: React.ReactNode;
  code: string;
  title: string;
  description: string;
}) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-card dark:bg-slate-900 dark:text-slate-500">
      {icon}
    </span>
    <p className="mt-5 font-mono text-xs tracking-widest text-slate-400 uppercase">{code}</p>
    <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
    <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
    <Link to="/tableau-de-bord" className="mt-6">
      <Button variant="secondary">Retour au tableau de bord</Button>
    </Link>
  </div>
);

export const NotFoundPage = () => (
  <Shell
    icon={<Compass className="h-6 w-6" />}
    code="Erreur 404"
    title="Page introuvable"
    description="L'adresse demandée n'existe pas ou a été déplacée. Vérifiez le lien ou revenez à la supervision."
  />
);

export const ForbiddenPage = () => (
  <Shell
    icon={<ShieldAlert className="h-6 w-6" />}
    code="Erreur 403"
    title="Accès non autorise"
    description="Votre profil ne dispose pas des habilitations nécessaires pour consulter cette section. Contactez votre administrateur."
  />
);
