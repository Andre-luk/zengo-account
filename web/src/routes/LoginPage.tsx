import { AlertTriangle, KeyRound, Loader2, Lock, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { useAuthStore } from '@/store/auth';

const HIGHLIGHTS = [
  { title: 'Anti-intrusion & incendie', text: 'Supervision temps réel de chaque centrale SafAlert Solar G1.' },
  { title: 'Appels vocaux IA', text: 'Qualification automatique du risque en 6 langues, DTMF et voix.' },
  { title: 'Interventions coordonnées', text: 'Engagement des pompiers, médics et équipes intrusion du PDC.' },
];

export const LoginPage = () => {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const pendingIdentifier = useAuthStore((state) => state.pendingIdentifier);
  const hasSession = useAuthStore((state) => Boolean(state.tokens?.accessToken));

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'two_factor'>('credentials');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirection differee : une session deja ouverte ne doit pas rendre un
  // <Navigate> pendant le rendu (boucle avec le garde de route).
  useEffect(() => {
    if (hasSession) navigate('/tableau-de-bord', { replace: true });
  }, [hasSession, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await login(
      identifier || pendingIdentifier || '',
      password,
      step === 'two_factor' ? totpCode : undefined,
    );

    setSubmitting(false);

    if (result.status === 'authenticated') {
      navigate('/tableau-de-bord', { replace: true });
      return;
    }
    if (result.status === 'two_factor_required') {
      setStep('two_factor');
      return;
    }
    setError(result.message);
  };

  const backToCredentials = () => {
    setStep('credentials');
    setTotpCode('');
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Presentoire de marque */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-slate-900 px-8 py-10 text-white lg:w-[46%] lg:px-14 lg:py-14">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 shadow-lg">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-semibold">Zengo Account</p>
              <p className="text-xs text-slate-400">SafAlert Solar G1</p>
            </div>
          </div>

          <h1 className="mt-10 max-w-md text-2xl font-semibold leading-snug lg:text-3xl">
            La console du Zengo Monitoring Center
          </h1>
          <p className="mt-3 max-w-md text-sm text-slate-300">
            Sécurité, santé préventive connectée et coordination des interventions d'urgence, sur un seul
            poste de travail.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-slate-400">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 text-[11px] text-slate-500">
          Zengo SARL — Kinshasa, République Démocratique du Congo
        </p>
      </section>

      {/* Formulaire */}
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {step === 'credentials' ? 'Connexion à la plateforme' : 'Vérification en deux étapes'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {step === 'credentials'
              ? 'Utilisez votre adresse professionnelle ou votre identifiant Zengo.'
              : "Saisissez le code à 6 chiffres généré par votre application d'authentification."}
          </p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            {step === 'credentials' ? (
              <>
                <Field label="Identifiant" required>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                    <Input
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      placeholder="prenom.nom@zengo.cd"
                      autoComplete="username"
                      autoFocus
                      required
                      className="pl-9"
                    />
                  </div>
                </Field>

                <Field label="Mot de passe" required>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      className="pl-9"
                    />
                  </div>
                </Field>
              </>
            ) : (
              <Field label="Code d'authentification" hint={`Compte : ${pendingIdentifier ?? identifier}`} required>
                <div className="relative">
                  <Smartphone className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                  <Input
                    value={totpCode}
                    onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    className="pl-9 font-mono text-base tracking-[0.4em]"
                  />
                </div>
              </Field>
            )}

            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <Button type="submit" fullWidth disabled={submitting} icon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
              {step === 'credentials' ? 'Se connecter' : 'Valider le code'}
            </Button>

            {step === 'two_factor' ? (
              <button
                type="button"
                onClick={backToCredentials}
                className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Revenir à la saisie des identifiants
              </button>
            ) : null}
          </form>

          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <p className="font-medium text-slate-700 dark:text-slate-300">Environnement de démonstration</p>
            <p className="mt-1">
              Opérateur ZMC : <span className="font-mono">operateur.zmc@zengo.cd</span> /{' '}
              <span className="font-mono">Zengo@2026</span>
            </p>
            <p>
              Administration : <span className="font-mono">admin@zengo.cd</span> /{' '}
              <span className="font-mono">Zengo@2026</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
