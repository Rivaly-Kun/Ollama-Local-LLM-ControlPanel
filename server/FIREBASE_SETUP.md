# Firebase Realtime Database Setup Guide

The API key is now fetched from **Firebase Realtime Database** instead of being hardcoded. No more hardcoded auth keys!

## Setup Steps

### 1. Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. This downloads a JSON file with all credentials

### 2. Extract Credentials to `.env`

Open the downloaded JSON file and add these values to `server/.env`:

```env
FIREBASE_PROJECT_ID=<project_id from JSON>
FIREBASE_DATABASE_URL=https://<project_id>.firebaseio.com

FIREBASE_PRIVATE_KEY_ID=<private_key_id>
FIREBASE_PRIVATE_KEY=<private_key> (keep the \n as is)
FIREBASE_CLIENT_EMAIL=<client_email>
FIREBASE_CLIENT_ID=<client_id>
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=<auth_provider_x509_cert_url>
FIREBASE_CLIENT_X509_CERT_URL=<client_x509_cert_url>

FIREBASE_AUTHKEY_PATH=config/authKey
```

### 3. Add API Key to Firebase Realtime Database

1. Go to **Firebase Console** → **Realtime Database**
2. Create the path: `config/authKey`
3. Set its value to your API key: `Zl6X-8OmGbTnk4Z)`

Or use the REST API:
```bash
curl -X PUT \
  https://<your-project>.firebaseio.com/config/authKey.json?auth=<database_secret> \
  -d '"Zl6X-8OmGbTnk4Z)"'
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

### 5. Start Server

```bash
python main.py
```

## How It Works

- Frontend calls `/controlpanelEflow/AUTHKEY` (no auth needed) to get the API key
- API key is **fetched from Firebase Realtime Database**, not hardcoded
- All subsequent requests use: `Authorization: Bearer <api_key>`
- **5-minute cache** to avoid constant database lookups
- If database is unavailable, uses cached key as fallback

## Updating the API Key

Just update the value at `config/authKey` in Firebase Realtime Database. The cache will refresh in 5 minutes or immediately on next request.

## Security Notes

- 🔒 Keep `FIREBASE_PRIVATE_KEY` secret (add to `.gitignore`)
- 🔐 Use Firebase Security Rules to restrict who can read/write `config/authKey`
- 🚀 Consider rotating credentials periodically
