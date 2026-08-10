# Contributing to Flowline

Thanks for your interest in improving Flowline! A few things to know before you send
a change.

## Open-core, dual-licensed

Flowline is **open-core**. The core is licensed under **AGPL-3.0** (see
[LICENSE](LICENSE)); a small set of premium directories are under a separate
**commercial license** (see [LICENSE-PREMIUM](LICENSE-PREMIUM) and
[PREMIUM-LICENSING.md](PREMIUM-LICENSING.md)). The same code is built once and the
premium tier is unlocked at runtime by a signed license key.

To keep that model legally sound, the project must be able to distribute the **core
and the premium tier together in one build** — which means the maintainer needs to
hold, or be licensed for, the rights to every line in the core. That is only possible
if contributions come with a clear inbound grant. Hence the CLA below. Without it, a
single AGPL-only contribution to core would make it impossible to keep shipping the
combined build lawfully.

## Contributor License Agreement (required)

By submitting a pull request or patch, you agree that, for each contribution:

1. **You have the right to submit it** — it is your original work, or you have the
   necessary rights to contribute it, and it does not knowingly infringe anyone's
   rights.
2. **You grant the project a broad license.** You grant Flowline's maintainer a
   perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to
   reproduce, modify, sublicense, and distribute your contribution **and to license
   it under any terms**, including both AGPL-3.0 and the commercial premium license.
   You retain copyright to your contribution.
3. **You certify the DCO** — your contribution complies with the
   [Developer Certificate of Origin](https://developercertificate.org/) 1.1.

Sign off every commit to certify the above:

```bash
git commit -s -m "Your message"
```

which adds a `Signed-off-by: Your Name <you@example.com>` trailer. A PR without
sign-off on its commits cannot be merged.

> If your employer owns your work, make sure you have permission to contribute under
> these terms before signing off.

## Ground rules for changes

- **Don't touch the license gate to enable premium.** Changes to
  `backend/src/edition.ts` or `backend/src/license/**` that weaken or bypass license
  verification will not be accepted.
- **Keep the free edition whole.** The core must build and run fully without any
  license key. Premium features live in the premium directories and must stay gated
  behind their feature flags in `backend/src/plugins/index.ts`.
- **Match the surrounding code** — style, naming, and comment density.
- **Tests and build must pass:**
  ```bash
  cd backend  && npm test && npm run build
  cd frontend && npm run build
  ```

## Reporting issues

Open an issue with steps to reproduce, expected vs. actual behavior, and your
environment (OS, Node version, Docker vs. local). For anything security-sensitive,
please contact the maintainer privately rather than filing a public issue.
