# BlindLock Backend

Production-oriented backend for BlindLock using Cloudflare Workers, D1, and R2.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.dev.vars.example` to `.dev.vars` and fill in secrets.

3. Create D1 and R2 resources, then update `wrangler.toml`.

4. Apply schema:

```bash
wrangler d1 execute secure-vault-db --local --file=./schema.sql
```

5. Start development:

```bash
npm run dev
```

## Environment Variables

- `JWT_SECRET`
- `RESEND_API_KEY`
- `APP_BASE_URL`
- `ALLOWED_ORIGINS`
- `MAX_FILE_SIZE_BYTES`

## Notes

- Access tokens expire in 15 minutes.
- Refresh tokens expire in 7 days and rotate on refresh.
- OTPs expire in 5 minutes and are stored hashed.
- Uploads are limited to 5MB.
- Download flow returns a short-lived signed URL, then streams the R2 object.
- Locked folders require the `x-folder-password` header on file access operations.
- Rate limiting is implemented in-memory per Worker isolate. For globally consistent production throttling, move this to Durable Objects or Cloudflare's native rate limiting product.

## API Examples

### Auth

```bash
curl -X POST http://127.0.0.1:8787/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","mobile":"+15551234567","password":"StrongPass1"}'
```

```bash
curl -X POST http://127.0.0.1:8787/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","code":"123456"}'
```

```bash
curl -X POST http://127.0.0.1:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"StrongPass1"}'
```

```bash
curl -X POST http://127.0.0.1:8787/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"REFRESH_TOKEN"}'
```

```bash
curl -X POST http://127.0.0.1:8787/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"REFRESH_TOKEN"}'
```

```bash
curl -X POST http://127.0.0.1:8787/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

```bash
curl -X POST http://127.0.0.1:8787/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","code":"123456","new_password":"NewStrongPass1"}'
```

### Folders

```bash
curl -X POST http://127.0.0.1:8787/folder/create \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Personal","password":"FolderPass1"}'
```

```bash
curl -X GET http://127.0.0.1:8787/folder/list \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

```bash
curl -X POST http://127.0.0.1:8787/folder/lock \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"folder_id":1,"password":"FolderPass1"}'
```

```bash
curl -X POST http://127.0.0.1:8787/folder/unlock \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"folder_id":1,"password":"FolderPass1"}'
```

```bash
curl -X DELETE http://127.0.0.1:8787/folder/delete \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"folder_id":1}'
```

### Files

```bash
curl -X POST http://127.0.0.1:8787/file/upload \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "x-folder-password: FolderPass1" \
  -F "folder_id=1" \
  -F "file=@/path/to/document.pdf"
```

```bash
curl -X GET "http://127.0.0.1:8787/file/list?folder_id=1&page=1&limit=10" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "x-folder-password: FolderPass1"
```

```bash
curl -X GET http://127.0.0.1:8787/file/download/1 \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "x-folder-password: FolderPass1"
```

```bash
curl -X DELETE http://127.0.0.1:8787/file/delete \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "x-folder-password: FolderPass1" \
  -H "Content-Type: application/json" \
  -d '{"file_id":1}'
```
