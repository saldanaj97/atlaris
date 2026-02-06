# Neon API Guidelines

## Overview

This document outlines the rules for managing Neon API keys programmatically. It covers listing existing keys, creating new keys, and revoking keys.

### Important note on creating API keys

To create new API keys using the API, you must already possess a valid Personal API Key. The first key must be created from the Neon Console. You can ask the user to create one for you if you do not have one.

### List API keys

- Endpoint: `GET /api_keys`
- Authorization: Use a Personal API Key.

Example request:

```bash
curl "https://console.neon.tech/api/v2/api_keys" \
  -H "Authorization: Bearer $PERSONAL_API_KEY"
```

Example response:

```json
[
  {
    "id": 1234567890,
    "name": "my-personal-key",
    "created_at": "2025-09-10T09:44:04Z",
    "created_by": {
      "id": "<ID>",
      "name": "<USER_NAME>",
      "image": "<USER_IMAGE_URL>"
    },
    "last_used_at": "2025-09-10T09:44:09Z",
    "last_used_from_addr": "49.43.218.132,34.211.200.85"
  }
]
```

### Create an API key

- Endpoint: `POST /api_keys`
- Authorization: Use a Personal API Key.
- Body: Must include a `key_name`.

Example request:

```bash
curl https://console.neon.tech/api/v2/api_keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PERSONAL_API_KEY" \
  -d '{"key_name": "my-new-key"}'
```

Example response:

```json
{
  "id": 1234567890,
  "key": "key",
  "name": "my-new-key",
  "created_at": "2025-09-10T09:47:59Z",
  "created_by": "<ID>"
}
```

### Revoke an API key

- Endpoint: `DELETE /api_keys/{key_id}`
- Authorization: Use a Personal API Key.

Example request:

```bash
curl -X DELETE \
  'https://console.neon.tech/api/v2/api_keys/2291515' \
  -H "Authorization: Bearer $PERSONAL_API_KEY"
```

Example response:

```json
{
  "id": 1234567890,
  "name": "mynewkey",
  "created_at": "2025-09-10T09:47:59Z",
  "created_by": "<ID>",
  "last_used_at": "2025-09-10T09:53:01Z",
  "last_used_from_addr": "2405:201:c01f:7013:d962:2b4f:2740:9750",
  "revoked": true
}
```
