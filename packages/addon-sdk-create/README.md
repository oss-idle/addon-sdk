# @oss-idle/addon-sdk-create

Scaffold an [oss!idle](https://github.com/oss-idle/oss-idle) add-on.

```sh
npx @oss-idle/addon-sdk-create@latest my-addon
```

```
  --name "My Add-on"      display name (default: the directory name)
  --template react|plain  starting point (default: react)
  --license <spdx>        default: AGPL-3.0-only
  --force                 write into a non-empty directory
```

Then:

```sh
cd my-addon
npm install
npm run build
```

Paste the emitted file into the in-game add-on editor (Options → Add-ons →
Manage) and enable it.

The scaffolding lives in [`@oss-idle/addon-sdk`](https://www.npmjs.com/package/@oss-idle/addon-sdk),
which this package is a front door for - `oss-idle-addon init` does the same
thing from inside an existing project.

## Licence

AGPL-3.0-only.
