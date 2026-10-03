import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AlertTriangle, KeyRound, Loader2, Lock, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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
    const [step, setStep] = useState('credentials');
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    if (hasSession)
        return _jsx(Navigate, { to: "/tableau-de-bord", replace: true });
    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        const result = await login(identifier || pendingIdentifier || '', password, step === 'two_factor' ? totpCode : undefined);
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
    return (_jsxs("div", { className: "flex min-h-screen flex-col lg:flex-row", children: [_jsxs("section", { className: "relative flex flex-col justify-between overflow-hidden bg-slate-900 px-8 py-10 text-white lg:w-[46%] lg:px-14 lg:py-14", children: [_jsx("div", { className: "absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand-600/30 blur-3xl" }), _jsx("div", { className: "absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" }), _jsxs("div", { className: "relative", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 shadow-lg", children: _jsx(ShieldCheck, { className: "h-6 w-6" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-lg font-semibold", children: "Zengo Account" }), _jsx("p", { className: "text-xs text-slate-400", children: "SafAlert Solar G1" })] })] }), _jsx("h1", { className: "mt-10 max-w-md text-2xl font-semibold leading-snug lg:text-3xl", children: "La console du Zengo Monitoring Center" }), _jsx("p", { className: "mt-3 max-w-md text-sm text-slate-300", children: "S\u00E9curit\u00E9, sant\u00E9 pr\u00E9ventive connect\u00E9e et coordination des interventions d'urgence, sur un seul poste de travail." }), _jsx("ul", { className: "mt-10 space-y-5", children: HIGHLIGHTS.map((item) => (_jsxs("li", { className: "flex gap-3", children: [_jsx("span", { className: "mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-400" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: item.title }), _jsx("p", { className: "text-xs text-slate-400", children: item.text })] })] }, item.title))) })] }), _jsx("p", { className: "relative mt-10 text-[11px] text-slate-500", children: "Zengo SARL \u2014 Kinshasa, R\u00E9publique D\u00E9mocratique du Congo" })] }), _jsx("section", { className: "flex flex-1 items-center justify-center px-6 py-12", children: _jsxs("div", { className: "w-full max-w-sm", children: [_jsx("h2", { className: "text-xl font-semibold text-slate-900 dark:text-white", children: step === 'credentials' ? 'Connexion a la plateforme' : 'Vérification en deux étapes' }), _jsx("p", { className: "mt-1 text-sm text-slate-500 dark:text-slate-400", children: step === 'credentials'
                                ? 'Utilisez votre adresse professionnelle ou votre identifiant Zengo.'
                                : "Saisissez le code à 6 chiffres généré par votre application d'authentification." }), _jsxs("form", { className: "mt-7 space-y-4", onSubmit: handleSubmit, children: [step === 'credentials' ? (_jsxs(_Fragment, { children: [_jsx(Field, { label: "Identifiant", required: true, children: _jsxs("div", { className: "relative", children: [_jsx(Mail, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { value: identifier, onChange: (event) => setIdentifier(event.target.value), placeholder: "prenom.nom@zengo.cd", autoComplete: "username", autoFocus: true, required: true, className: "pl-9" })] }) }), _jsx(Field, { label: "Mot de passe", required: true, children: _jsxs("div", { className: "relative", children: [_jsx(Lock, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { type: "password", value: password, onChange: (event) => setPassword(event.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", autoComplete: "current-password", required: true, className: "pl-9" })] }) })] })) : (_jsx(Field, { label: "Code d'authentification", hint: `Compte : ${pendingIdentifier ?? identifier}`, required: true, children: _jsxs("div", { className: "relative", children: [_jsx(Smartphone, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { value: totpCode, onChange: (event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6)), placeholder: "000000", inputMode: "numeric", autoComplete: "one-time-code", autoFocus: true, required: true, className: "pl-9 font-mono text-base tracking-[0.4em]" })] }) })), error ? (_jsxs("div", { className: "flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-3.5 w-3.5 shrink-0" }), _jsx("span", { children: error })] })) : null, _jsx(Button, { type: "submit", fullWidth: true, disabled: submitting, icon: submitting ? _jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : undefined, children: step === 'credentials' ? 'Se connecter' : 'Valider le code' }), step === 'two_factor' ? (_jsxs("button", { type: "button", onClick: backToCredentials, className: "flex w-full items-center justify-center gap-1.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400", children: [_jsx(KeyRound, { className: "h-3.5 w-3.5" }), "Revenir a la saisie des identifiants"] })) : null] }), _jsxs("div", { className: "mt-8 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400", children: [_jsx("p", { className: "font-medium text-slate-700 dark:text-slate-300", children: "Environnement de demonstration" }), _jsxs("p", { className: "mt-1", children: ["Op\u00E9rateur ZMC : ", _jsx("span", { className: "font-mono", children: "operateur.zmc@zengo.cd" }), " /", ' ', _jsx("span", { className: "font-mono", children: "Zengo@2026" })] }), _jsxs("p", { children: ["Administration : ", _jsx("span", { className: "font-mono", children: "admin@zengo.cd" }), " /", ' ', _jsx("span", { className: "font-mono", children: "Zengo@2026" })] })] })] }) })] }));
};
