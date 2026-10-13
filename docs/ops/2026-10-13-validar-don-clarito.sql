-- Validación de la configuración de Don Clarito (solo lectura).
-- Uso (en psql, cuik_prod):   \set slug 'don-clarito'   y luego   \i docs/ops/2026-10-13-validar-don-clarito.sql
-- Compara cada bloque con la ficha: 10 sellos, premios en visita 3/6/10,
-- compra mínima S/ 35, 1 visita por día, sucursal Surquillo, strip 750x288.

\echo '== 1. Comercio, plan y estado'
SELECT t.slug, t.name, t.status, t.business_type, t.timezone, t.contact_email,
       t.apple_config IS NOT NULL AS apple_ok,
       t.branding->>'logoUrl' AS logo, t.branding->>'iconUrl' AS icon,
       t.branding->>'primaryColor' AS primario, t.branding->>'accentColor' AS acento
FROM tenants t WHERE t.slug = :'slug';

\echo '== 2. Programa (esperado: stamps, 10 sellos, hitos 3/6/10, mínimo 35, 1 visita/día)'
SELECT p.type, p.active, p.max_visits, p.reward_value,
       p.config->'stamps'->>'minimumPurchaseAmount' AS compra_minima,
       p.config->'stamps'->>'maxVisitsPerDay' AS visitas_por_dia,
       p.config->'stamps'->'milestones' AS hitos,
       p.config->'stamps'->'milestoneMessages' AS mensajes_hitos
FROM loyalty.promotions p JOIN tenants t ON t.id = p.tenant_id
WHERE t.slug = :'slug' ORDER BY p.active DESC, p.created_at DESC;

\echo '== 3. Sucursales (esperado: Surquillo, activa, con coordenadas si usan geolocalizadas)'
SELECT l.name, l.address, l.active, l.lat IS NOT NULL AND l.lng IS NOT NULL AS geo
FROM loyalty.locations l JOIN tenants t ON t.id = l.tenant_id WHERE t.slug = :'slug';

\echo '== 4. Diseño de pase activo (esperado: 1 activo, stripVersion 2, sello 96, offsets 35/48, gaps 130/96)'
SELECT d.id, d.name, d.is_active, d.version, d.updated_at,
       d.stamps_config->>'stripVersion' AS strip_v,
       d.stamps_config->>'stampSize' AS sello,
       d.stamps_config->>'offsetX' AS off_x, d.stamps_config->>'offsetY' AS off_y,
       d.stamps_config->>'gapX' AS gap_x, d.stamps_config->>'gapY' AS gap_y,
       d.stamps_config->'rowOffsets' AS filas,
       jsonb_array_length(coalesce(d.fields->'backFields', '[]'::jsonb)) AS back_fields
FROM passes.pass_designs d JOIN tenants t ON t.id = d.tenant_id
WHERE t.slug = :'slug' ORDER BY d.is_active DESC, d.updated_at DESC;

\echo '== 5. Imágenes del diseño activo (esperado: strip_bg, stamp, icon y logo con URL de MinIO)'
SELECT a.type, left(a.url, 90) AS url
FROM passes.pass_assets a
JOIN passes.pass_designs d ON d.id = a.design_id
JOIN tenants t ON t.id = d.tenant_id
WHERE t.slug = :'slug' AND d.is_active ORDER BY a.type;

\echo '== 6. Reverso del pase (back fields: slogan, horario, dirección, carta, términos)'
SELECT jsonb_array_elements(d.fields->'backFields')->>'key' AS clave,
       left(jsonb_array_elements(d.fields->'backFields')->>'label', 40) AS titulo,
       left(jsonb_array_elements(d.fields->'backFields')->>'value', 60) AS contenido
FROM passes.pass_designs d JOIN tenants t ON t.id = d.tenant_id
WHERE t.slug = :'slug' AND d.is_active;

\echo '== 7. Usuarios del comercio (esperado: 1 admin/owner y al menos 1 cajero)'
SELECT m.role, u.email, u.created_at::date
FROM organization o JOIN member m ON m.organization_id = o.id
JOIN "user" u ON u.id = m.user_id WHERE o.slug = :'slug' ORDER BY m.role;

\echo '== 8. Clientes y pases emitidos (0 es normal antes del primer cliente)'
SELECT count(DISTINCT c.id) AS clientes, count(pi.id) AS pases,
       count(pi.id) FILTER (WHERE pi.device_tokens IS NOT NULL AND pi.device_tokens::text <> '[]') AS apple_instalados,
       count(pi.id) FILTER (WHERE pi.google_saved_at IS NOT NULL) AS google_guardados
FROM loyalty.clients c
LEFT JOIN passes.pass_instances pi ON pi.client_id = c.id
JOIN tenants t ON t.id = c.tenant_id WHERE t.slug = :'slug';

\echo '== 9. Automatizaciones (cumpleaños, geolocalizadas)'
SELECT t.automations->'birthday'->>'enabled' AS cumple_on,
       left(t.automations->'birthday'->>'message', 60) AS cumple_msg,
       t.wallet_config->'locations' AS geo_puntos,
       left(t.wallet_config->>'relevantText', 60) AS geo_msg
FROM tenants t WHERE t.slug = :'slug';
