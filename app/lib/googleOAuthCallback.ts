/** Parse OAuth params from exp:// or https:// callback URLs (hash + query). */
export function extractOAuthParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  const hashStart = url.indexOf('#');
  if (hashStart !== -1) {
    new URLSearchParams(url.slice(hashStart + 1)).forEach((value, key) => {
      params[key] = value;
    });
  }

  const queryStart = url.indexOf('?');
  if (queryStart !== -1) {
    const queryEnd = hashStart !== -1 ? hashStart : url.length;
    new URLSearchParams(url.slice(queryStart + 1, queryEnd)).forEach((value, key) => {
      params[key] = value;
    });
  }

  return params;
}

export function getIdTokenFromCallbackUrl(url: string | null): string | null {
  if (!url) return null;
  return extractOAuthParams(url).id_token ?? null;
}
