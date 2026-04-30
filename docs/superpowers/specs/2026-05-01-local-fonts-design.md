# Local-font self-hosting design

## Goal

Eliminate the development-time Google Fonts requests for Inter and Noto Sans
Mono. The app must start, build, and run without network access while retaining
the current font families, CSS variable names, normal weight range, and
`font-display: swap` behavior.

## Chosen approach

Use `next/font/local` in the root layout and commit the font files to the
repository under `app/fonts/`. This makes the font assets part of the Next.js
output, so Electron and web builds serve them locally rather than asking Google
Fonts during compilation.

Two variable-font sources will be obtained from the fonts' official,
redistributable sources:

- Inter, for the current Latin UI text.
- Noto Sans Mono, retaining the current Latin and Cyrillic coverage.

Each source will include its upstream SIL Open Font License alongside the font
asset. The implementation will use compact WOFF2 files when a single file
retains the required glyph coverage; otherwise it will use the upstream variable
font file rather than dropping Cyrillic characters.

## Implementation boundary

- Add the two font assets and their licence notices to `app/fonts/`.
- Change only `app/layout.tsx`: replace `next/font/google` with
  `next/font/local`, preserving `--font-inter`, `--font-noto-mono`, and
  `display: "swap"`.
- Leave the existing `@fontsource/*` dependencies and all application styles
  unchanged. Removing unused packages is outside this focused change.

## Verification

- Run TypeScript's no-emit check.
- Start the development Electron app after the currently running instance is
  stopped, and confirm there are no `fonts.googleapis.com` or
  `next/font/google` download warnings.
- Do not run `next build`, because the project's development instructions
  prohibit it during normal development.

## Error handling and rollback

If an upstream font source cannot be downloaded with normal certificate
validation, stop rather than disabling TLS verification. The local-font change
can be reverted by restoring the single layout import/configuration; it does not
affect persisted data or runtime APIs.
