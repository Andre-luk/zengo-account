import { guessAudioContentType, isProxyableRecordingUrl } from '@modules/telephony/recording.util';

describe('Relecture des enregistrements d appel', () => {
  const base = { allowedHosts: [] as string[], providerName: 'TWILIO' };

  it('accepte un enregistrement Twilio lorsque le fournisseur est Twilio', () => {
    expect(
      isProxyableRecordingUrl('https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1', base),
    ).toBe(true);
  });

  it('refuse une URL Twilio servie par un autre fournisseur', () => {
    expect(
      isProxyableRecordingUrl('https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1', {
        allowedHosts: [],
        providerName: 'STUB',
      }),
    ).toBe(false);
  });

  it('accepte un hote explicitement autorise', () => {
    expect(
      isProxyableRecordingUrl('https://media.zengo.cd/calls/re-1.mp3', {
        allowedHosts: ['media.zengo.cd'],
        providerName: 'STUB',
      }),
    ).toBe(true);
  });

  it('ignore la casse des hotes autorises', () => {
    expect(
      isProxyableRecordingUrl('https://MEDIA.Zengo.CD/calls/re-1.mp3', {
        allowedHosts: [' media.zengo.cd '],
        providerName: 'STUB',
      }),
    ).toBe(true);
  });

  it('refuse une ressource interne (protection contre le relais ouvert)', () => {
    expect(
      isProxyableRecordingUrl('http://169.254.169.254/latest/meta-data/', base),
    ).toBe(false);
    expect(isProxyableRecordingUrl('http://localhost:5432/', base)).toBe(false);
    expect(
      isProxyableRecordingUrl('https://media.zengo.cd.evil.tld/re.mp3', {
        allowedHosts: ['media.zengo.cd'],
        providerName: 'STUB',
      }),
    ).toBe(false);
  });

  it('refuse les protocoles non web', () => {
    expect(isProxyableRecordingUrl('file:///etc/passwd', base)).toBe(false);
    expect(isProxyableRecordingUrl('ftp://media.zengo.cd/re.mp3', base)).toBe(false);
  });

  it('refuse une URL absente ou illisible', () => {
    expect(isProxyableRecordingUrl(null, base)).toBe(false);
    expect(isProxyableRecordingUrl('', base)).toBe(false);
    expect(isProxyableRecordingUrl('pas-une-url', base)).toBe(false);
  });

  it('deduit le type audio renvoye au navigateur', () => {
    expect(guessAudioContentType('audio/x-wav')).toBe('audio/wav');
    expect(guessAudioContentType('audio/mpeg')).toBe('audio/mpeg');
    expect(guessAudioContentType(null)).toBe('audio/mpeg');
  });
});
