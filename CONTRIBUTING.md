# Contributing

Thanks for helping improve wa-client!

## Setup

```bash
git clone https://github.com/OsamahAlhwawi/wa-client.git
cd wa-client
npm install
```

## Before opening a pull request

```bash
npm run typecheck
npm test
npm run build
```

- Add or update tests in `test/` for any behavior change. Tests mock `fetch`, so no real WhatsApp account is needed.
- Keep the package dependency-free.
- Document new public methods with JSDoc and in `docs/`.
- Add an entry to `CHANGELOG.md`.

## License of contributions

By contributing you agree that your contributions are licensed under the [MPL-2.0](./LICENSE).
New source files must start with the MPL-2.0 header:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
```
