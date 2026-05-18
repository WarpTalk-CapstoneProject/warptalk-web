# Register Page Documentation

This document maintains the state, changes, and logic for the Register Page.

## Maintenance Notes

- The register page posts to `API.auth.register`, stores the returned auth state with `useAuthStore`, writes the `access_token` cookie, and redirects to `/dashboard`.
- Cookie persistence is handled through a helper outside the component render path so React lint rules do not flag cookie mutation or time calculations inside component logic.
