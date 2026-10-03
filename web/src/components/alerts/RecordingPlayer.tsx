import { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Lecteur d'enregistrement d'appel IA.
 *
 * Le fichier n'est pas servi par une URL publique : la route est protegee par
 * le JWT et le serveur relaie l'enregistrement du fournisseur. On le recupere
 * donc en blob pour construire une URL locale, liberee au demontage.
 */
export const RecordingPlayer = ({ voiceCallId, label }: { voiceCallId: string; label?: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const blob = await api.getBlob(`/voice-calls/${voiceCallId}/recording`);
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
        setError(null);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Enregistrement indisponible');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [voiceCallId]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Mic className="h-3.5 w-3.5" /> Chargement de l&apos;enregistrement…
      </p>
    );
  }

  if (error || !url) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {label ?? 'Enregistrement'} indisponible : {error ?? 'aucun fichier pour cet appel'}.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
        <Mic className="h-3.5 w-3.5" /> {label ?? "Enregistrement de l'appel"}
      </p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls preload="none" src={url} className="h-9 w-full max-w-sm" />
    </div>
  );
};
