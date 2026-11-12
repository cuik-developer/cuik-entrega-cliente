-- Análisis de compras por categoría, marca y SKU (panel › Análisis › Compras y
-- exportación de compras). La clasificación de cada línea vendida se guarda en
-- la base para consultarla en SQL: la maestra de productos manda; si un SKU
-- no está en la maestra, se usa la ruta de categoría de Odoo y la marca entre
-- paréntesis del nombre.
--
-- DEPLOY ORDER (producción): aplicar con psql ANTES de hacer push del código.
-- Idempotente. Tras el deploy, la sincronización rellena las líneas antiguas
-- sola (o super-admin › Growth › Conectores POS › "Reclasificar líneas").

-- Clasificación de cada línea vendida: 'gato:alimento_humedo', 'perro:snacks', ':servicios'…
ALTER TABLE analytics.sale_lines ADD COLUMN IF NOT EXISTS category_key text;
ALTER TABLE analytics.sale_lines ADD COLUMN IF NOT EXISTS brand text;
CREATE INDEX IF NOT EXISTS sale_lines_tenant_category_idx ON analytics.sale_lines (tenant_id, category_key);
CREATE INDEX IF NOT EXISTS sale_lines_tenant_brand_idx ON analytics.sale_lines (tenant_id, brand);

-- La maestra de productos gana sobre Odoo: marca, presentación y cuánto dura el producto.
ALTER TABLE analytics.products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE analytics.products ADD COLUMN IF NOT EXISTS pack_size text;       -- "7 kg", "lata 100 g"
ALTER TABLE analytics.products ADD COLUMN IF NOT EXISTS duration_days integer; -- días que suele durar (recompra esperada)
