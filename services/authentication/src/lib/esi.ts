import axios from 'axios';

const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const ESI_OAUTH_URL = 'https://login.eveonline.com/v2/oauth';
const ESI_OAUTH_VERIFY_URL = 'https://login.eveonline.com/oauth/verify';

export interface EveCharacter {
  characterId: number;
  characterName: string;
  corpId: number;
  corpName: string;
  allianceId?: number;
  allianceName?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

function getOAuthCredentials() {
  const clientId = process.env.EVE_CLIENT_ID;
  const clientSecret = process.env.EVE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('EVE_CLIENT_ID and EVE_CLIENT_SECRET must be set');
  }

  return {
    clientId,
    clientSecret,
    authHeader: Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
  };
}

export function getAuthorizationUrl(state: string): string {
  const { clientId } = getOAuthCredentials();
  const callbackUrl = process.env.EVE_CALLBACK_URL || 'http://localhost:3007/auth/callback';
  const scopes = process.env.EVE_SCOPES || 'publicData';

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: callbackUrl,
    client_id: clientId,
    scope: scopes,
    state,
  });

  return `https://login.eveonline.com/v2/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { authHeader } = getOAuthCredentials();
  const callbackUrl = process.env.EVE_CALLBACK_URL || 'http://localhost:3007/auth/callback';

  const response = await axios.post<TokenResponse>(
    `${ESI_OAUTH_URL}/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
    }
  );

  return response.data;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { authHeader } = getOAuthCredentials();

  const response = await axios.post<TokenResponse>(
    `${ESI_OAUTH_URL}/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
    }
  );

  return response.data;
}

export async function verifyAccessToken(accessToken: string): Promise<{
  characterId: number;
  characterName: string;
  scopes: string;
}> {
  const response = await axios.get(ESI_OAUTH_VERIFY_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return {
    characterId: response.data.CharacterID,
    characterName: response.data.CharacterName,
    scopes: response.data.Scopes || '',
  };
}

export async function getCharacterInfo(characterId: number): Promise<{
  name: string;
  corporationId: number;
  allianceId?: number;
}> {
  const response = await axios.get(`${ESI_BASE_URL}/characters/${characterId}/`);
  return {
    name: response.data.name,
    corporationId: response.data.corporation_id,
    allianceId: response.data.alliance_id,
  };
}

export async function getCorporationInfo(corpId: number): Promise<{
  name: string;
  ticker: string;
  allianceId?: number;
}> {
  const response = await axios.get(`${ESI_BASE_URL}/corporations/${corpId}/`);
  return {
    name: response.data.name,
    ticker: response.data.ticker,
    allianceId: response.data.alliance_id,
  };
}

export async function getAllianceInfo(allianceId: number): Promise<{
  name: string;
  ticker: string;
}> {
  const response = await axios.get(`${ESI_BASE_URL}/alliances/${allianceId}/`);
  return {
    name: response.data.name,
    ticker: response.data.ticker,
  };
}

export async function getCharacterPortrait(characterId: number): Promise<string> {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=128`;
}

export async function getFullCharacterInfo(
  accessToken: string
): Promise<EveCharacter> {
  // Verify token and get character ID
  const verified = await verifyAccessToken(accessToken);

  // Get character details
  const charInfo = await getCharacterInfo(verified.characterId);

  // Get corporation details
  const corpInfo = await getCorporationInfo(charInfo.corporationId);

  // Get alliance details if applicable
  let allianceName: string | undefined;
  if (corpInfo.allianceId) {
    const allianceInfo = await getAllianceInfo(corpInfo.allianceId);
    allianceName = allianceInfo.name;
  }

  return {
    characterId: verified.characterId,
    characterName: verified.characterName,
    corpId: charInfo.corporationId,
    corpName: corpInfo.name,
    allianceId: corpInfo.allianceId,
    allianceName,
  };
}
