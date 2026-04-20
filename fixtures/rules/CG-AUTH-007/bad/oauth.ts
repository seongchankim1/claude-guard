export function authorizeUrl(clientId: string) {
  return `https://provider.example.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=https://app/cb`;
}
