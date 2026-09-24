# Split Generate into three steps

## Build
- Add a page step state for **Notes**, **Customisation**, and **Generating**.
- Show a compact progress title using real arrow icons: `Generate: Noting…`, then `Generate: Notes → Customising…`, then `Generate: Notes → Customisation → Generating…`.
- Keep title, subject, audience, source text, files, instructions, and quiz settings in place while moving backward and forward.
- Show only note/source fields on the first step, with a small **Next** button aligned bottom-right.
- Show instructions and quiz customisation on the second step, with matching **Back** and **Generate** buttons at opposite bottom corners.
- Start the existing analysis and generation flow only from **Generate**, retain the low-information pause, and navigate to the finished quiz under its quiz title as before.

## Validation
- Check forward/back navigation preserves entered values.
- Check generation progress appears only after Generate is pressed.
- Check desktop and mobile layouts for button placement and text fit.
