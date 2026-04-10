/**
 * `Authorization` header value for https://api-seller.uzum.uz/api/seller-openapi/...
 * Must be identical for every request (shops, finance, etc.).
 *
 * By default adds `Bearer ` when missing (OpenAPI/Swagger-style). If the stored value
 * already starts with `Bearer `, it is left unchanged.
 *
 * Set `UZUM_OPENAPI_RAW_AUTHORIZATION=true` to send the trimmed token without adding `Bearer `
 * (legacy behavior if the API key must be sent raw).
 */
export function buildUzumSellerOpenApiAuthorizationHeader(
  token: string,
): string {
  const trimmed = token.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^Bearer\s+/i.test(trimmed)) {
    return trimmed;
  }
  if (process.env.UZUM_OPENAPI_RAW_AUTHORIZATION === 'true') {
    return trimmed;
  }
  return `Bearer ${trimmed}`;
}
