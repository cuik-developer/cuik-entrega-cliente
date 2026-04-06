# Manual de Deployment — Cuik

> Guia completa para llevar la plataforma Cuik a produccion.
> Dirigido a desarrolladores/tecnicos que necesitan hacer deploy desde cero.

**Ultima actualizacion**: 2026-03-30

---

## Tabla de contenidos

1. [Requisitos previos](#1-requisitos-previos)
2. [Opciones de hosting](#2-opciones-de-hosting)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Setup de base de datos](#4-setup-de-base-de-datos)
5. [Setup de Apple Wallet](#5-setup-de-apple-wallet)
6. [Setup de Google Wallet](#6-setup-de-google-wallet)
7. [Setup de almacenamiento (MinIO/S3)](#7-setup-de-almacenamiento-minios3)
8. [Setup de email (Resend)](#8-setup-de-email-resend)
9. [Build y deploy](#9-build-y-deploy)
10. [Post-deploy](#10-post-deploy)
11. [Mantenimiento](#11-mantenimiento)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Requisitos previos

### Software obligatorio

| Herramienta | Version minima | Para que |
|---|---|---|
| **Node.js** | 22+ (LTS) | Runtime. El Dockerfile usa `node:22-alpine` |
| **pnpm** | 10.12+ | Package manager del monorepo. Definido en `packageManager` del root `package.json` |
| **PostgreSQL** | 16+ | Base de datos principal |
| **Git** | 2.40+ | Control de versiones |

### Cuentas y servicios externos

| Servicio | Obligatorio | Costo | Para que |
|---|---|---|---|
| **Apple Developer Program** | Si (para Apple Wallet) | $99 USD/anio | Crear Pass Type IDs, certificados de firma, APNs keys |
| **Google Cloud Console** | Si (para Google Wallet) | Gratis (con limites) | Google Wallet API, Service Account |
| **Resend** | Si (para emails) | Gratis hasta 3,000 emails/mes | Emails transaccionales (invitaciones, reset password, notificaciones) |
| **Dominio con SSL** | Si | Variable | HTTPS obligatorio para Apple Wallet Web Service Protocol |
| **MinIO / S3** | Recomendado | Variable (self-hosted gratis) | Almacenamiento de assets de pases. Sin esto, usa filesystem local (solo dev) |

### Requisitos de hardware (produccion)

- **CPU**: 2 vCPU minimo
- **RAM**: 2 GB minimo (4 GB recomendado)
- **Disco**: 20 GB SSD minimo
- **Red**: IP publica con puerto 443 abierto

---

## 2. Opciones de hosting

### Opcion A: Dokploy (self-hosted) — Recomendado

Dokploy es una plataforma PaaS self-hosted (como Heroku pero en tu propio servidor). El proyecto ya tiene configuracion parcial para Dokploy.

**Pros:**
- Control total sobre la infraestructura
- Sin vendor lock-in
- Dashboard web para gestionar deployments
- SSL automatico con Let's Encrypt
- Soporte nativo para Docker y Git push deploy
- Costo fijo mensual del VPS

**Contras:**
- Requiere mantener el servidor (actualizaciones de seguridad, backups)
- Setup inicial mas complejo que un PaaS gestionado

**Costo aproximado:** $10-25 USD/mes (VPS en Hetzner, DigitalOcean, o Contabo)

**Pasos basicos:**
1. Provisionar un VPS con Ubuntu 22.04+
2. Instalar Dokploy: `curl -sSL https://dokploy.com/install.sh | sh`
3. Acceder al panel de Dokploy (puerto 3000 del servidor)
4. Crear un proyecto, conectar el repositorio Git
5. Configurar variables de entorno en el panel
6. Configurar el dominio y SSL
7. Deploy via Git push o boton en el panel

### Opcion B: Vercel

**Pros:**
- Deploy en un click desde GitHub
- SSL automatico, CDN global, edge functions
- Zero configuracion de infraestructura
- Previews automaticos por PR
- Excelente para Next.js (son los creadores)

**Contras:**
- Costo puede escalar rapido con trafico
- Cold starts en funciones serverless
- Limitaciones en tamanio de funciones (50 MB)
- PostgreSQL requiere servicio externo (Neon, Supabase, etc.)
- MinIO/storage requiere servicio externo

**Costo aproximado:** $20 USD/mes (plan Pro) + $15-25 DB externa

**Pasos basicos:**
1. Conectar repo en vercel.com
2. Configurar root directory: `apps/web`
3. Configurar variables de entorno en Settings > Environment Variables
4. Configurar Build Command: `cd ../.. && pnpm build`
5. Configurar Output Directory: `.next`
6. Deploy

### Opcion C: VPS con Docker

**Pros:**
- Maximo control y flexibilidad
- Costo predecible y bajo
- Todo en un solo servidor (app + DB + MinIO)
- Sin dependencia de plataformas terceras

**Contras:**
- Requiere conocimiento de Docker, nginx, certbot
- Mantenimiento manual (backups, SSL renewal, security patches)
- Sin zero-downtime deploys nativos (requiere configuracion adicional)

**Costo aproximado:** $5-15 USD/mes (VPS basico)

**Pasos basicos:**
1. Provisionar VPS con Ubuntu/Debian
2. Instalar Docker y Docker Compose
3. Configurar nginx como reverse proxy
4. Configurar certbot para SSL
5. Usar `docker-compose.prod.yml` como base
6. Deploy con `docker compose up -d`

### Opcion D: Railway

**Pros:**
- Deploy simple desde GitHub
- PostgreSQL integrado
- Facil de escalar
- Preview environments por PR

**Contras:**
- Mas caro que VPS para el mismo rendimiento
- Menos control que self-hosted
- Cobro por uso (puede ser impredecible)

**Costo aproximado:** $5-20 USD/mes (segun uso)

**Pasos basicos:**
1. Crear proyecto en railway.app
2. Agregar servicio PostgreSQL
3. Conectar repo de GitHub
4. Configurar variables de entorno
5. Railway detecta Next.js automaticamente
6. Deploy automatico en cada push

---

## 3. Variables de entorno

### Referencia completa

Todas las variables de entorno que usa la plataforma, agrupadas por servicio. Las marcadas con `*` son obligatorias en produccion.

### 3.1 Base de datos

| Variable | Obligatoria | Descripcion | Ejemplo |
|---|---|---|---|
| `DATABASE_URL` | * | Connection string de PostgreSQL | `postgresql://cuik:PASSWORD@localhost:5432/cuik_prod` |

**Como obtenerla:**
```bash
# Formato: postgresql://USUARIO:PASSWORD@HOST:PUERTO/DATABASE
# Ejemplo local:
DATABASE_URL="postgresql://cuik:mi_password_seguro@localhost:5432/cuik_prod"

# Ejemplo con Neon (DB externa):
DATABASE_URL="postgresql://cuik:xxx@ep-cool-name-123.us-east-2.aws.neon.tech/cuik_prod?sslmode=require"
```

### 3.2 Autenticacion (Better Auth)

| Variable | Obligatoria | Descripcion | Ejemplo |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | * | Secret para firmar sesiones y tokens JWT. Debe ser aleatorio y largo (32+ caracteres) | `a1b2c3d4e5f6...` (64 chars hex) |
| `BETTER_AUTH_URL` | * | URL base de la app. Usado internamente por Better Auth para construir URLs de callback | `https://app.cuik.org` |
| `TRUSTED_ORIGINS` | * | Lista de origenes confiados separados por coma. Necesario para CORS y CSRF | `https://app.cuik.org,https://www.cuik.org` |

**Como generar `BETTER_AUTH_SECRET`:**
```bash
# Opcion 1: openssl (recomendado)
openssl rand -hex 32

# Opcion 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.3 Apple Wallet — Firma de pases

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `APPLE_TEAM_ID` | * | Team ID de tu cuenta Apple Developer (10 caracteres alfanumericos) |
| `APPLE_PASS_TYPE_ID` | * | Pass Type ID registrado en Apple Developer (ej: `pass.cuik.org.default`) |
| `APPLE_SIGNER_KEY_BASE64` | * | Clave privada del certificado de firma, codificada en base64 |
| `APPLE_SIGNER_CERT_BASE64` | * | Certificado de firma (.pem), codificado en base64 |
| `APPLE_SIGNER_KEY_PASSPHRASE` | No | Passphrase de la clave privada (si la tiene) |
| `APPLE_WWDR_BASE64` | * | Certificado WWDR G4 de Apple, codificado en base64 |
| `APPLE_AUTH_SECRET` | * | Secret para autenticar dispositivos en el Web Service Protocol |
| `APPLE_WEBSERVICE_URL` | * | URL publica donde se sirve el Web Service Protocol (HTTPS obligatorio) |

**Como codificar certificados en base64:**
```bash
# Codificar un archivo .pem a base64 (una sola linea, sin saltos)
base64 -w 0 < mi_certificado.pem

# En macOS:
base64 -i mi_certificado.pem | tr -d '\n'

# Verificar que decodifica correctamente:
echo "TU_BASE64_AQUI" | base64 -d | head -1
# Debe mostrar: -----BEGIN CERTIFICATE----- o -----BEGIN PRIVATE KEY-----
```

**Como generar `APPLE_AUTH_SECRET`:**
```bash
openssl rand -hex 32
```

### 3.4 Apple Wallet — APNs (Push Notifications)

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `APPLE_APNS_KEY_ID` | * | Key ID del APNs key (.p8) creado en Apple Developer |
| `APPLE_APNS_TEAM_ID` | * | Team ID (generalmente igual a `APPLE_TEAM_ID`) |
| `APPLE_APNS_P8_BASE64` | * | Contenido del archivo .p8, codificado en base64 |
| `APPLE_APNS_TOPIC` | * | Topic para APNs — DEBE coincidir con el `APPLE_PASS_TYPE_ID` |

**Como codificar el archivo .p8:**
```bash
base64 -w 0 < AuthKey_XXXXXXXXXX.p8

# En macOS:
base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n'
```

> **IMPORTANTE:** `APPLE_APNS_TOPIC` DEBE ser identico a `APPLE_PASS_TYPE_ID`. Si no coinciden, las push notifications de actualizacion de pases no funcionaran. Ver seccion de Troubleshooting.

### 3.5 Google Wallet

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `GOOGLE_WALLET_ISSUER_ID` | * | Issuer ID de Google Wallet API (numerico) |
| `GOOGLE_WALLET_SA_JSON_B64` | * | JSON completo de la Service Account, codificado en base64 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | No | JSON de Service Account en texto plano (alternativa para campanas) |

**Como codificar la Service Account:**
```bash
# El archivo JSON descargado de Google Cloud
base64 -w 0 < service-account.json

# En macOS:
base64 -i service-account.json | tr -d '\n'

# Verificar que decodifica correctamente:
echo "TU_BASE64" | base64 -d | python3 -m json.tool | head -5
```

### 3.6 Almacenamiento (MinIO / S3)

| Variable | Obligatoria | Descripcion | Ejemplo |
|---|---|---|---|
| `MINIO_ENDPOINT` | Recomendado | Host y puerto del servidor MinIO/S3 | `minio.mi-servidor.com:9000` |
| `MINIO_ACCESS_KEY` | Recomendado | Access key de MinIO/S3 | `cuik_minio_access` |
| `MINIO_SECRET_KEY` | Recomendado | Secret key de MinIO/S3 | `cuik_minio_secret_key` |
| `MINIO_BUCKET` | No | Nombre del bucket (default: `cuik-assets`) | `cuik-assets` |
| `MINIO_USE_SSL` | No | Usar SSL para la conexion (default: `false`) | `true` |

> **Nota:** Si no se configuran las variables de MinIO, el sistema usa el filesystem local como fallback (directorio `.local-storage/`). Esto es aceptable solo para desarrollo.

### 3.7 Email (Resend)

| Variable | Obligatoria | Descripcion | Ejemplo |
|---|---|---|---|
| `RESEND_API_KEY` | * | API key de Resend | `re_xxxxxxxxx` |
| `EMAIL_FROM` | No | Direccion de remitente (default: `Cuik <noreply@cuik.org>`) | `Cuik <noreply@tu-dominio.com>` |
| `EMAIL_TEST_TO` | No | Si se define, TODOS los emails van a esta direccion (para testing) | `test@tu-email.com` |
| `SA_EMAIL` | No | Email del Super Admin para notificaciones de solicitudes (default: `sa@cuik.app`) | `admin@tu-empresa.com` |

### 3.8 Encriptacion

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `ENCRYPTION_KEY` | * | Clave AES-256-GCM para encriptar datos sensibles (certificados de tenants en DB). Debe ser exactamente 64 caracteres hexadecimales (32 bytes) |

**Como generar:**
```bash
openssl rand -hex 32
# Produce exactamente 64 caracteres hexadecimales
```

> **CRITICO:** Si pierdes esta clave, no podras descifrar los certificados Apple almacenados en la base de datos para cada tenant. Guardala en un lugar seguro.

### 3.9 Generacion de Assets con IA (opcional)

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `GEMINI_API_KEY` | No | API key de Google Gemini para generacion de imagenes con IA (strip, logo, stamps). Sin esta variable, el boton "Generar diseño completo" en el editor de pases no funcionara, pero se pueden subir imagenes manualmente |

**Como obtener:**
1. Ir a [Google AI Studio](https://aistudio.google.com/apikey)
2. Crear una API key
3. Copiar la key y agregarla al `.env`

**Requisito adicional:** El CLI `nano-banana` debe estar instalado globalmente:
```bash
npm install -g nano-banana
```

> **Nota:** Esta variable es OPCIONAL. Sin ella, toda la plataforma funciona normalmente — solo se deshabilita la generacion automatica de assets visuales con IA.

### 3.10 Aplicacion

| Variable | Obligatoria | Descripcion | Ejemplo |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | * | URL publica de la aplicacion. Usado para construir enlaces en emails y pases | `https://app.cuik.org` |
| `NODE_ENV` | * | Entorno de ejecucion | `production` |
| `CRON_SECRET` | Recomendado | Secret para autenticar llamadas a endpoints cron | Generar con `openssl rand -hex 32` |

### Archivo `.env` completo de referencia

```bash
# ─── Base de datos ────────────────────────────────────
DATABASE_URL="postgresql://cuik:PASSWORD@localhost:5432/cuik_prod"

# ─── Autenticacion ────────────────────────────────────
BETTER_AUTH_SECRET="<openssl rand -hex 32>"
BETTER_AUTH_URL="https://app.cuik.org"
TRUSTED_ORIGINS="https://app.cuik.org"

# ─── Apple Wallet — Firma ─────────────────────────────
APPLE_TEAM_ID="XXXXXXXXXX"
APPLE_PASS_TYPE_ID="pass.cuik.org.default"
APPLE_SIGNER_KEY_BASE64="<base64 de la clave privada>"
APPLE_SIGNER_CERT_BASE64="<base64 del certificado .pem>"
APPLE_SIGNER_KEY_PASSPHRASE=""
APPLE_WWDR_BASE64="<base64 del certificado WWDR G4>"
APPLE_AUTH_SECRET="<openssl rand -hex 32>"
APPLE_WEBSERVICE_URL="https://app.cuik.org/api/apple-wallet/v1"

# ─── Apple Wallet — APNs ──────────────────────────────
APPLE_APNS_KEY_ID="XXXXXXXXXX"
APPLE_APNS_TEAM_ID="XXXXXXXXXX"
APPLE_APNS_P8_BASE64="<base64 del archivo .p8>"
APPLE_APNS_TOPIC="pass.cuik.org.default"

# ─── Google Wallet ─────────────────────────────────────
GOOGLE_WALLET_ISSUER_ID="1234567890123456789"
GOOGLE_WALLET_SA_JSON_B64="<base64 del service-account.json>"

# ─── Almacenamiento ───────────────────────────────────
MINIO_ENDPOINT="minio.mi-servidor.com:9000"
MINIO_ACCESS_KEY="cuik_access"
MINIO_SECRET_KEY="cuik_secret"
MINIO_BUCKET="cuik-assets"
MINIO_USE_SSL="true"

# ─── Email ─────────────────────────────────────────────
RESEND_API_KEY="re_xxxxxxxxx"
EMAIL_FROM="Cuik <noreply@tu-dominio.com>"
SA_EMAIL="admin@tu-empresa.com"

# ─── Encriptacion ──────────────────────────────────────
ENCRYPTION_KEY="<openssl rand -hex 32>"

# ─── IA (opcional) ─────────────────────────────────────
GEMINI_API_KEY=""  # Google Gemini API key para generacion de assets con IA

# ─── Aplicacion ────────────────────────────────────────
NEXT_PUBLIC_APP_URL="https://app.cuik.org"
NODE_ENV="production"
CRON_SECRET="<openssl rand -hex 32>"
```

---

## 4. Setup de base de datos

### 4.1 Crear la base de datos

```bash
# Conectar a PostgreSQL como superusuario
sudo -u postgres psql

# Crear usuario y base de datos
CREATE USER cuik WITH PASSWORD 'tu_password_seguro';
CREATE DATABASE cuik_prod OWNER cuik;

# Configurar timezone UTC (IMPORTANTE)
ALTER DATABASE cuik_prod SET timezone = 'UTC';

# Otorgar permisos para crear schemas
GRANT ALL ON DATABASE cuik_prod TO cuik;
\c cuik_prod
GRANT ALL ON SCHEMA public TO cuik;
CREATE SCHEMA IF NOT EXISTS loyalty;
CREATE SCHEMA IF NOT EXISTS passes;
CREATE SCHEMA IF NOT EXISTS campaigns;
CREATE SCHEMA IF NOT EXISTS analytics;
GRANT ALL ON SCHEMA loyalty TO cuik;
GRANT ALL ON SCHEMA passes TO cuik;
GRANT ALL ON SCHEMA campaigns TO cuik;
GRANT ALL ON SCHEMA analytics TO cuik;

\q
```

> **IMPORTANTE:** La base de datos DEBE estar en timezone UTC. Cada tenant tiene su propio timezone configurado en la tabla `tenants` (columna `timezone`, default `America/Lima`), y la app convierte las fechas en la capa de aplicacion. Si la DB no esta en UTC, los calculos de fechas seran incorrectos.

### 4.2 Correr migraciones

```bash
# Desde la raiz del monorepo
cd packages/db

# Asegurate de que DATABASE_URL este definida
export DATABASE_URL="postgresql://cuik:tu_password@localhost:5432/cuik_prod"

# Ejecutar migraciones
pnpm db:migrate
```

Las migraciones estan en `packages/db/migrations/` y se gestionan con Drizzle Kit. Al momento hay 6 migraciones que crean:
- Esquemas: `public`, `loyalty`, `passes`, `campaigns`, `analytics`
- Tablas core: `tenants`, `plans`, `solicitudes`, `global_config`
- Tablas de auth: `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`
- Tablas de loyalty: `clients`, `visits`, `rewards`, `promotions`, `locations`
- Tablas de wallet: `pass_designs`, `pass_assets`, `pass_instances`, `apple_devices`
- Columnas adicionales: wallet config, segmentation config, apple config per-tenant, timezone

### 4.3 Seed inicial (datos de demo)

El seed crea datos de demo para desarrollo/testing. **NO ejecutar en produccion** (esta bloqueado por `NODE_ENV === "production"`).

```bash
# Requiere que la app este corriendo (usa la API de Better Auth internamente)
pnpm dev  # en otra terminal

# Seed via API endpoint (solo en dev)
pnpm db:seed
# o directamente:
curl http://localhost:3000/api/seed
```

El seed crea:
- **3 planes**: Trial (gratis), Basico ($69), Pro ($159)
- **5 usuarios**: Super Admin, 2 admins, 2 cajeros
- **2 tenants**: Mascota Veloz (activo), Cafe Central (trial)
- **2 locaciones, 2 promociones, 6 clientes, visitas de demo**
- **2 disenos de pase con assets placeholder**

### 4.4 Credenciales por defecto del Super Admin

| Campo | Valor |
|---|---|
| Email | `sa@cuik.app` |
| Password | `password123` |
| Rol | `super_admin` |

> **CRITICO:** Cambiar la password del Super Admin inmediatamente despues del primer login en produccion. El seed solo se puede ejecutar en modo desarrollo.

### 4.5 Crear Super Admin manualmente (produccion)

En produccion, como el seed no funciona, debes crear el Super Admin manualmente:

```bash
# Opcion 1: Registrar via la app y promover a super_admin
# 1. Ir a https://tu-dominio.com/register
# 2. Crear cuenta con email y password
# 3. Conectar a la DB y promover:
psql $DATABASE_URL -c "UPDATE public.\"user\" SET role = 'super_admin' WHERE email = 'tu@email.com';"

# Opcion 2: Crear planes primero (necesarios para el flujo)
psql $DATABASE_URL << 'EOF'
INSERT INTO public.plans (name, price, max_locations, max_promos, max_clients, features, active)
VALUES
  ('Trial', 0, 1, 1, 50, '{"trial": true}', true),
  ('Basico', 6900, 2, 3, 200, '{"basic": true}', true),
  ('Pro', 15900, 5, 10, 1000, '{"pro": true, "analytics": true, "campaigns": true}', true);
EOF
```

---

## 5. Setup de Apple Wallet

### 5.1 Crear cuenta Apple Developer

1. Ir a [developer.apple.com](https://developer.apple.com)
2. Inscribirse en el Apple Developer Program ($99 USD/anio)
3. Completar la verificacion (puede tomar 24-48 horas)
4. Una vez aprobado, anotar el **Team ID** (se ve en la esquina superior derecha del portal, o en Membership > Team ID)

### 5.2 Crear Pass Type ID

1. En [developer.apple.com/account/resources](https://developer.apple.com/account/resources):
2. Ir a **Identifiers** > clic en el boton **+**
3. Seleccionar **Pass Type IDs** > Continue
4. Ingresar:
   - **Description**: `Cuik Loyalty Pass` (o lo que prefieras)
   - **Identifier**: `pass.cuik.org.default` (formato: `pass.TU_DOMINIO.NOMBRE`)
5. Clic en **Register**

> **Nota:** Cada tenant puede tener su propio Pass Type ID (almacenado en `apple_config` del tenant). El global es el fallback.

### 5.3 Generar certificado de firma

1. En **Identifiers** > **Pass Type IDs** > seleccionar el Pass Type ID creado
2. Clic en **Create Certificate**
3. Seguir el asistente:
   - Abrir **Keychain Access** en macOS > Certificate Assistant > Request a Certificate from a Certificate Authority
   - Guardar en disco el archivo `.certSigningRequest`
   - Subir el CSR a Apple Developer
   - Descargar el certificado `.cer`
4. Importar el `.cer` a Keychain Access (doble clic)
5. Exportar como `.p12` (clic derecho en el certificado > Export):
   - Puede pedir un passphrase — recordarla o dejarla vacia

6. Convertir a PEM (clave privada + certificado separados):

```bash
# Extraer la clave privada
openssl pkcs12 -in certificate.p12 -nocerts -out signer_key.pem
# Si tiene passphrase, usar -passin pass:TU_PASSPHRASE
# Para quitar passphrase: agregar -nodes

# Extraer el certificado
openssl pkcs12 -in certificate.p12 -clcerts -nokeys -out signer_cert.pem

# Codificar en base64 para env vars
APPLE_SIGNER_KEY_BASE64=$(base64 -w 0 < signer_key.pem)
APPLE_SIGNER_CERT_BASE64=$(base64 -w 0 < signer_cert.pem)

echo "APPLE_SIGNER_KEY_BASE64=$APPLE_SIGNER_KEY_BASE64"
echo "APPLE_SIGNER_CERT_BASE64=$APPLE_SIGNER_CERT_BASE64"
```

### 5.4 Generar APNs key (.p8)

1. En [developer.apple.com/account/resources](https://developer.apple.com/account/resources):
2. Ir a **Keys** > clic en el boton **+**
3. Ingresar nombre: `Cuik APNs Key`
4. Marcar **Apple Push Notifications service (APNs)**
5. Clic en **Register** > **Download**
6. **GUARDAR EL ARCHIVO .p8** — Apple solo permite descargarlo UNA VEZ
7. Anotar el **Key ID** (10 caracteres, se muestra en la lista de keys)

```bash
# Codificar en base64
APPLE_APNS_P8_BASE64=$(base64 -w 0 < AuthKey_XXXXXXXXXX.p8)
echo "APPLE_APNS_P8_BASE64=$APPLE_APNS_P8_BASE64"
```

### 5.5 Descargar WWDR G4 Certificate

El certificado WWDR (Apple Worldwide Developer Relations) es publico y necesario para la cadena de confianza.

```bash
# Descargar WWDR G4
curl -O https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer

# Convertir de DER a PEM
openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr_g4.pem

# Codificar en base64
APPLE_WWDR_BASE64=$(base64 -w 0 < wwdr_g4.pem)
echo "APPLE_WWDR_BASE64=$APPLE_WWDR_BASE64"
```

### 5.6 Configurar APPLE_WEBSERVICE_URL

Esta URL es donde Apple envia las requests del Web Service Protocol (registrar/desregistrar dispositivos, obtener pases actualizados).

```
APPLE_WEBSERVICE_URL="https://app.cuik.org/api/apple-wallet/v1"
```

**Requisitos:**
- DEBE ser HTTPS (Apple rechaza HTTP)
- DEBE ser accesible publicamente
- NO incluir trailing slash
- El path `/api/apple-wallet/v1` es fijo — esta implementado en `apps/web/app/api/apple-wallet/v1/[...path]/route.ts`

### 5.7 Verificar que funciona

Despues de configurar todas las variables, verificar en los logs de la app:

```
# Si todo esta bien, NO veras estos warnings:
[Wallet:Apple] Disabled — missing env vars: ...
[Wallet:APNs] Disabled — missing env vars: ...
[Wallet:Apple] APPLE_WEBSERVICE_URL not set — ...
```

Para una verificacion mas profunda:
1. Login como Super Admin
2. Ir a `/admin/pases`
3. Crear un pase de prueba para un tenant
4. Verificar que el pase `.pkpass` se descarga correctamente en Safari/iOS

---

## 6. Setup de Google Wallet

### 6.1 Crear proyecto en Google Cloud

1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. Crear un proyecto nuevo: `cuik-wallet` (o el nombre que prefieras)
3. Anotar el **Project ID**

### 6.2 Habilitar Google Wallet API

1. En la consola de Google Cloud > **APIs & Services** > **Library**
2. Buscar **Google Wallet API**
3. Clic en **Enable**

### 6.3 Crear Service Account

1. **IAM & Admin** > **Service Accounts** > **Create Service Account**
2. Nombre: `cuik-wallet-issuer`
3. No necesita roles adicionales de Google Cloud
4. Clic en **Done**
5. Clic en la service account creada > **Keys** > **Add Key** > **Create new key** > **JSON**
6. Se descarga un archivo `service-account.json` — **guardarlo de forma segura**

```bash
# Codificar en base64
GOOGLE_WALLET_SA_JSON_B64=$(base64 -w 0 < service-account.json)
echo "GOOGLE_WALLET_SA_JSON_B64=$GOOGLE_WALLET_SA_JSON_B64"
```

> **IMPORTANTE:** El JSON de la Service Account DEBE contener `client_email` y `private_key`. La app valida esto explicitamente al decodificar.

### 6.4 Obtener Issuer ID

1. Ir a [pay.google.com/business/console](https://pay.google.com/business/console)
2. Si es la primera vez, completar el registro de Google Pay & Wallet Console
3. **Google Wallet API** > el **Issuer ID** aparece en el dashboard (numero largo)
4. Agregar la **service account email** (del paso anterior) como usuario con permisos de escritura

```
GOOGLE_WALLET_ISSUER_ID="1234567890123456789"
```

### 6.5 Verificar que funciona

En los logs de la app, no deberia aparecer:
```
[Wallet:Google] Disabled — missing env vars: ...
[Wallet:Google] Disabled — failed to decode GOOGLE_WALLET_SA_JSON_B64
[Wallet:Google] Disabled — service account JSON missing client_email or private_key
```

Para verificar end-to-end:
1. Crear un tenant con pase activo
2. Registrar un cliente
3. El cliente deberia ver el boton "Add to Google Wallet" en su pagina de bienvenida

---

## 7. Setup de almacenamiento (MinIO/S3)

### Opcion A: MinIO Self-hosted (recomendado para self-hosted)

MinIO es un servidor de almacenamiento compatible con S3. El proyecto ya incluye `docker-compose.yml` con MinIO.

```bash
# Usando Docker Compose (desarrollo)
docker compose -f docker/docker-compose.yml up -d minio

# En produccion, agregar al docker-compose.prod.yml o instalar aparte:
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=cuik_minio \
  -e MINIO_ROOT_PASSWORD=tu_password_seguro \
  -v minio_data:/data \
  minio/minio server /data --console-address ":9001"
```

Variables de entorno:
```bash
MINIO_ENDPOINT="localhost:9000"        # o minio:9000 si esta en Docker network
MINIO_ACCESS_KEY="cuik_minio"
MINIO_SECRET_KEY="tu_password_seguro"
MINIO_BUCKET="cuik-assets"
MINIO_USE_SSL="false"                  # true si usas reverse proxy con SSL
```

La app crea el bucket automaticamente si no existe (funcion `ensureBucket()`).

Consola web de MinIO: `http://tu-servidor:9001`

### Opcion B: AWS S3

```bash
MINIO_ENDPOINT="s3.amazonaws.com"
MINIO_ACCESS_KEY="AKIAIOSFODNN7EXAMPLE"
MINIO_SECRET_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
MINIO_BUCKET="cuik-assets"
MINIO_USE_SSL="true"
```

### Opcion C: Cloudflare R2

R2 es compatible con la API de S3 y no tiene costos de egress.

```bash
MINIO_ENDPOINT="ACCOUNT_ID.r2.cloudflarestorage.com"
MINIO_ACCESS_KEY="tu_access_key_r2"
MINIO_SECRET_KEY="tu_secret_key_r2"
MINIO_BUCKET="cuik-assets"
MINIO_USE_SSL="true"
```

### Sin storage (solo desarrollo)

Si no se configuran las variables de MinIO, la app usa el directorio `.local-storage/` como fallback. Los assets se guardan en disco local. Esto NO es aceptable para produccion porque:
- Se pierden en cada deploy/rebuild del contenedor
- No escala a multiples instancias
- No tiene CDN ni redundancia

---

## 8. Setup de email (Resend)

### 8.1 Crear cuenta en Resend

1. Ir a [resend.com](https://resend.com) y crear cuenta
2. En el dashboard, ir a **API Keys** > **Create API Key**
3. Nombre: `cuik-production`, permisos: **Full access** (o solo sending)
4. Copiar el API key (`re_xxxxxxxxx`)

### 8.2 Configurar dominio

1. En Resend > **Domains** > **Add Domain**
2. Ingresar tu dominio (ej: `cuik.org`)
3. Agregar los registros DNS que Resend indica (SPF, DKIM, DMARC)
4. Esperar verificacion (puede tomar minutos a horas)
5. Una vez verificado, puedes enviar desde `@tu-dominio.com`

### 8.3 Variables

```bash
RESEND_API_KEY="re_xxxxxxxxx"
EMAIL_FROM="Cuik <noreply@cuik.org>"   # Debe ser de un dominio verificado
SA_EMAIL="admin@tu-empresa.com"         # Email del SA para recibir notificaciones de solicitudes
```

### 8.4 Modo testing

Para evitar enviar emails reales durante testing:
```bash
EMAIL_TEST_TO="test@tu-email.com"  # TODOS los emails iran a esta direccion
```

---

## 9. Build y deploy

### 9.1 Build local

```bash
# Instalar dependencias
pnpm install

# Build de todo el monorepo (packages primero, luego apps)
pnpm build

# Iniciar en modo produccion
pnpm start
# La app corre en http://localhost:3000
```

### 9.2 Docker

El proyecto incluye un Dockerfile multi-stage en `docker/Dockerfile`. Al momento esta en estado **parcialmente configurado** (tiene TODOs). Para completarlo:

**Dockerfile funcional (basado en el existente):**

El Dockerfile actual (`docker/Dockerfile`) tiene placeholders. Para produccion, necesitas:

1. Habilitar `output: "standalone"` en `next.config.mjs`:
```javascript
const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}
```

2. Completar los TODOs del Dockerfile (copiar `package.json` de cada paquete, configurar usuario no-root, copiar standalone output)

3. Build y run:
```bash
docker build -f docker/Dockerfile -t cuik-web .
docker run -p 3000:3000 --env-file .env cuik-web
```

### 9.3 Docker Compose (produccion)

El archivo `docker/docker-compose.prod.yml` define el servicio de la app. Para produccion completa, necesitas agregar:

```yaml
# docker/docker-compose.prod.yml (extendido)
services:
  app:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - ../.env
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

```bash
# Deploy
docker compose -f docker/docker-compose.prod.yml up -d --build

# Ver logs
docker compose -f docker/docker-compose.prod.yml logs -f app

# Rebuild despues de cambios
docker compose -f docker/docker-compose.prod.yml up -d --build
```

### 9.4 Deploy con Dokploy

1. En el panel de Dokploy, crear nuevo proyecto
2. Tipo: **Application** > **Docker**
3. Conectar el repositorio Git
4. Configurar:
   - **Dockerfile path**: `docker/Dockerfile`
   - **Build context**: `.` (raiz del repo)
5. En **Environment**: pegar todas las variables de la seccion 3
6. En **Domains**: configurar tu dominio con SSL automatico
7. Hacer deploy

### 9.5 Deploy con Vercel

1. Importar repositorio en vercel.com
2. **Framework Preset**: Next.js
3. **Root Directory**: `apps/web`
4. **Build Command**: `cd ../.. && pnpm install && pnpm build`
5. **Install Command**: (dejar vacio, lo hace el build command)
6. En **Settings > Environment Variables**: agregar todas las variables
7. Deploy

> **Nota Vercel:** El `output: "standalone"` NO es necesario para Vercel — Vercel maneja el bundling automaticamente.

### 9.6 Health checks

La app no tiene un endpoint `/api/health` dedicado. Para health checks basicos, puedes verificar:
- `GET /` — debe retornar 200 (landing page)
- `GET /login` — debe retornar 200 (pagina de login)

Si necesitas un health check mas robusto, crear `apps/web/app/api/health/route.ts`:
```typescript
import { db, sql } from "@cuik/db"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`)
    return NextResponse.json({ status: "ok", db: "connected" })
  } catch {
    return NextResponse.json({ status: "error", db: "disconnected" }, { status: 503 })
  }
}
```

---

## 10. Post-deploy

### 10.1 Checklist de verificacion

Despues de hacer deploy, verificar en este orden:

- [ ] **La app carga**: `https://tu-dominio.com` muestra la landing
- [ ] **Login funciona**: ir a `/login`, crear cuenta, verificar que redirige al panel
- [ ] **Super Admin existe**: promover un usuario a `super_admin` (ver seccion 4.5)
- [ ] **Panel SA funciona**: ir a `/admin` y verificar acceso
- [ ] **Planes existen**: ir a `/admin/tenants` — debe haber planes disponibles
- [ ] **Crear tenant de prueba**: desde el panel SA, crear un tenant y asignarle plan Trial
- [ ] **Apple Wallet**: verificar en logs que no hay warnings de `[Wallet:Apple] Disabled`
- [ ] **Google Wallet**: verificar en logs que no hay warnings de `[Wallet:Google] Disabled`
- [ ] **Email funciona**: crear una solicitud desde el landing y verificar que llega el email al SA
- [ ] **Storage funciona**: subir un asset de pase y verificar que se guarda correctamente
- [ ] **Pase funciona**: generar un pase y descargar en un dispositivo real

### 10.2 Configurar APPLE_WEBSERVICE_URL

Despues de confirmar que el dominio funciona con SSL:

```bash
APPLE_WEBSERVICE_URL="https://tu-dominio.com/api/apple-wallet/v1"
```

Verificar que Apple puede alcanzar la URL:
```bash
curl -I https://tu-dominio.com/api/apple-wallet/v1/devices/test/registrations/pass.cuik.org.default
# Debe responder (probablemente 401 Unauthorized — pero eso confirma que llega)
```

### 10.3 Configurar cron jobs

La app tiene endpoints cron protegidos por `CRON_SECRET`:

| Endpoint | Frecuencia recomendada | Funcion |
|---|---|---|
| `POST /api/cron/campaigns-scheduled` | Cada 5 minutos | Ejecuta campanas programadas |
| `POST /api/cron/analytics-daily` | Una vez al dia (3 AM) | Genera metricas diarias |
| `POST /api/cron/analytics-retention` | Una vez al dia (4 AM) | Calcula cohortes de retencion |

```bash
# Ejemplo con crontab
*/5 * * * * curl -s -H "Authorization: Bearer TU_CRON_SECRET" -X POST https://tu-dominio.com/api/cron/campaigns-scheduled
0 3 * * * curl -s -H "x-cron-secret: TU_CRON_SECRET" -X POST https://tu-dominio.com/api/cron/analytics-daily
0 4 * * * curl -s -H "x-cron-secret: TU_CRON_SECRET" -X POST https://tu-dominio.com/api/cron/analytics-retention
```

> En Vercel, usar Vercel Cron Jobs en `vercel.json`. En Railway, usar su sistema de cron integrado.

### 10.4 Desarrollo local con ngrok (opcional)

Para probar Apple Wallet Web Service Protocol en desarrollo local:

```bash
# Instalar ngrok
brew install ngrok  # o descargarlo de ngrok.com

# Exponer puerto 3000
ngrok http 3000

# Copiar la URL HTTPS generada (ej: https://abc123.ngrok-free.app)
# Usar como APPLE_WEBSERVICE_URL:
APPLE_WEBSERVICE_URL="https://abc123.ngrok-free.app/api/apple-wallet/v1"
```

---

## 11. Mantenimiento

### 11.1 Backups de base de datos

```bash
# Backup completo (diario)
pg_dump -U cuik -h localhost cuik_prod -F c -f backup_$(date +%Y%m%d).dump

# Restaurar
pg_restore -U cuik -h localhost -d cuik_prod backup_20260330.dump

# Backup automatizado (agregar a crontab)
0 2 * * * pg_dump -U cuik -h localhost cuik_prod -F c -f /backups/cuik_$(date +\%Y\%m\%d).dump && find /backups -name "cuik_*.dump" -mtime +30 -delete
```

> **IMPORTANTE:** Respaldar tambien el `ENCRYPTION_KEY`. Sin el, los certificados Apple encriptados en la DB son irrecuperables.

### 11.2 Rotacion de certificados Apple (anual)

Los certificados de firma de Apple Wallet vencen cada anio. Proceso de renovacion:

1. Ir a [developer.apple.com](https://developer.apple.com) > Certificates
2. El certificado vencido aparecera con fecha de expiracion
3. Revocar el viejo y crear uno nuevo (seguir pasos de seccion 5.3)
4. Actualizar las env vars:
   - `APPLE_SIGNER_KEY_BASE64`
   - `APPLE_SIGNER_CERT_BASE64`
5. Para tenants con certificados propios: actualizar su `apple_config` en la DB
6. Reiniciar la app

> **Tip:** Configurar una alerta 30 dias antes del vencimiento. El APNs key (.p8) NO vence.

### 11.3 Rotacion del certificado WWDR

Apple puede actualizar el WWDR. Verificar periodicamente:
```bash
# Descargar la version mas reciente
curl -O https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr_g4.pem
APPLE_WWDR_BASE64=$(base64 -w 0 < wwdr_g4.pem)
```

### 11.4 Monitoreo de logs

Buscar estos patrones en los logs para detectar problemas:

| Patron | Significado |
|---|---|
| `[Wallet:Apple] Disabled` | Variables de Apple Wallet no configuradas |
| `[Wallet:Google] Disabled` | Variables de Google Wallet no configuradas |
| `[Storage] Disabled` | MinIO no configurado, usando filesystem local |
| `[getTenantAppleConfig] Failed to decrypt` | ENCRYPTION_KEY incorrecta o corrupta |
| `ENCRYPTION_KEY environment variable is required` | Falta ENCRYPTION_KEY |
| `[SEED ERROR]` | Error en el endpoint de seed |

### 11.5 Actualizacion de dependencias

```bash
# Ver paquetes desactualizados
pnpm outdated

# Actualizar interactivamente
pnpm update --interactive

# Actualizar todo (con cuidado)
pnpm update

# Despues de actualizar, verificar:
pnpm typecheck
pnpm build
pnpm test
```

### 11.6 Migraciones de base de datos

Al actualizar el codigo, puede haber nuevas migraciones:

```bash
# Verificar si hay migraciones pendientes
cd packages/db
pnpm db:migrate

# Si necesitas generar nuevas migraciones despues de cambiar schemas:
pnpm db:generate
```

---

## 12. Troubleshooting

### "Invalid PEM formatted message"

**Causa:** Las variables de entorno de certificados Apple contienen PEM en texto plano en vez de base64, o viceversa.

**Solucion:** La app espera **base64-encoded PEM**. Verificar:
```bash
# Decodificar y verificar formato
echo "$APPLE_SIGNER_CERT_BASE64" | base64 -d | head -1
# DEBE mostrar: -----BEGIN CERTIFICATE-----

echo "$APPLE_SIGNER_KEY_BASE64" | base64 -d | head -1
# DEBE mostrar: -----BEGIN PRIVATE KEY----- o -----BEGIN RSA PRIVATE KEY-----
```

Si el valor ya es PEM sin base64:
```bash
# Recodificar
APPLE_SIGNER_CERT_BASE64=$(echo "$VALOR_PEM_ACTUAL" | base64 -w 0)
```

> **Contexto historico:** Un fix reciente (`ce7bbf2`) agrego soporte para raw PEM en env vars ademas de base64. Pero la forma estandar es base64.

### "Safari no puede descargar el pase" / "Unable to download pass"

**Causas posibles:**
1. **Certificado incorrecto**: El certificado de firma no corresponde al Pass Type ID
2. **SSL invalido**: Apple requiere HTTPS valido con certificado confiable (no self-signed)
3. **WWDR desactualizado**: Descargar la version G4 mas reciente
4. **Pass Type ID no registrado**: Verificar en Apple Developer que el Pass Type ID existe

**Diagnostico:**
```bash
# Descargar el .pkpass y verificar su contenido
unzip -l pass.pkpass
# Debe contener: pass.json, manifest.json, signature, icon.png, etc.

# Verificar la firma
openssl smime -verify -in signature -content manifest.json -noverify
```

### El pase no se actualiza en Wallet (push no llega)

**Causa mas comun:** `APPLE_APNS_TOPIC` no coincide con `APPLE_PASS_TYPE_ID`.

**Fix reciente** (`a4e6ee6`): La app ahora usa el `passTypeId` per-tenant como APNs topic en la registracion de visitas. Verificar:

1. El `APPLE_APNS_TOPIC` en env vars coincide con `APPLE_PASS_TYPE_ID`
2. Para tenants con certificado propio, el `passTypeId` en su `apple_config` es correcto
3. El APNs key (.p8) tiene permisos para enviar push notifications
4. El dispositivo esta registrado en la tabla `apple_devices`

```bash
# Verificar dispositivos registrados
psql $DATABASE_URL -c "SELECT * FROM passes.apple_devices LIMIT 10;"
```

### Timezone incorrecto en reportes/analytics

**Causa:** La base de datos no esta configurada en UTC.

**Verificar:**
```bash
psql $DATABASE_URL -c "SHOW timezone;"
# Debe mostrar: UTC

# Si no es UTC:
psql $DATABASE_URL -c "ALTER DATABASE cuik_prod SET timezone = 'UTC';"
# Requiere reconexion para tomar efecto
```

La app maneja timezones por tenant (columna `timezone` en tabla `tenants`, default `America/Lima`). Los calculos de fecha se hacen en la capa de aplicacion.

### "ENCRYPTION_KEY must be 64 hex characters"

La clave debe ser exactamente 64 caracteres hexadecimales (0-9, a-f). Verificar:

```bash
echo -n "$ENCRYPTION_KEY" | wc -c
# Debe ser 64

# Generar una nueva si es necesario:
openssl rand -hex 32
```

> **PELIGRO:** Si cambias la ENCRYPTION_KEY, todos los certificados Apple encriptados en la DB se vuelven ilegibles. Solo cambiarla si no hay tenants con certificados propios, o re-encriptar todos los valores manualmente.

### La app no arranca / "Module not found"

```bash
# Limpiar e instalar de nuevo
rm -rf node_modules apps/web/node_modules packages/*/node_modules
pnpm install

# Rebuild
pnpm build
```

### Better Auth no funciona / sesiones se pierden

1. Verificar `BETTER_AUTH_SECRET` — si cambia, todas las sesiones se invalidan
2. Verificar `BETTER_AUTH_URL` — debe coincidir exactamente con la URL que usan los usuarios
3. Verificar `TRUSTED_ORIGINS` — debe incluir todos los origenes desde donde se accede

### Emails no llegan

1. Verificar `RESEND_API_KEY` es valida
2. Verificar que el dominio de envio esta verificado en Resend
3. Si `EMAIL_TEST_TO` esta definida, TODOS los emails van a esa direccion
4. Revisar el dashboard de Resend para ver errores de envio

### MinIO "Access Denied" o "Bucket not found"

1. Verificar credenciales (`MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`)
2. El bucket se crea automaticamente — si falla, verificar permisos del usuario
3. Si usas S3/R2, verificar que la region es correcta
4. Verificar `MINIO_USE_SSL` (true para servicios externos, false para local)

---

## Apendice: Arquitectura de referencia

```
                    [Internet]
                        |
                   [Nginx/Caddy]
                    SSL Termination
                        |
                  [Next.js App :3000]
                   /           \
          [PostgreSQL :5432]  [MinIO :9000]
                                |
                         [Object Storage]

Servicios externos:
- Apple APNs (push notifications)
- Google Wallet API
- Resend (emails)
```

### Puertos por defecto

| Servicio | Puerto | Notas |
|---|---|---|
| Next.js App | 3000 | Configurable con `PORT` env var |
| PostgreSQL | 5432 | Estandar |
| MinIO API | 9000 | S3-compatible |
| MinIO Console | 9001 | Panel web de administracion |
| Redis | 6379 | Definido en docker-compose pero no usado activamente aun |

---

## Apendice: Estructura del monorepo

```
cuik_loyanty/
  apps/web/                  # Next.js 16 — frontend + backend
  packages/db/               # Drizzle ORM — schemas, migrations, seed
  packages/shared/           # Types, validators (Zod)
  packages/ui/               # shadcn/ui components
  packages/wallet/           # Apple/Google Wallet (pure library)
  packages/editor/           # Visual pass editor (react-konva)
  packages/email/            # React Email + Resend
  docker/                    # Dockerfile + docker-compose files
  scripts/                   # DB utility scripts (overview, reset, seed-fresh)
  docs/                      # Documentacion
```
