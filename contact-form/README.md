# Iqra Contact Form

This is a standalone frontend for the public contact/complaint form. It can be
built and deployed independently of the school dashboard, for example to a
separate subdomain. It submits to the existing backend endpoint at
`/api/public/contact-messages`; submissions continue to be saved separately
from verification messages.

## Configure

Copy `.env.example` to `.env` and set `REACT_APP_BACKEND_URL` to the backend
origin (without the `/api` suffix). For production, configure the same variable
in the static hosting provider before building.

The backend must allow the contact-form subdomain in its `CORS_ORIGINS`
configuration.

## Run and build

```text
npm install
npm start
```

Create the deployment files with:

```text
npm run build
```

Deploy the contents of `build/` as the subdomain's static site.
