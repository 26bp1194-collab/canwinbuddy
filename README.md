# CanWinBuddy

App Name: CanWinBuddy
The App Idea:
An app that can generate questions that are made to be questions for the information given the user and those generated questions can be exported to quiz sites such as Blooket, Gimkit, and etc. The questions can also be played as a game within the app itself. Include history menu that saves your generated questions and can be loaded back again from the history.
​The Features:
1.Dashboard Menu: A panel showing user metrics and generation stats.
2.Generate Page: The main functional area that lets you execute the core generation process of the app.
3.History Page: An archive page that lets you check your generated questions and be able to click and reopen them.
4.Settings Page: A configuration panel for customization.
5.Light mode/Dark mode Button below all pages and menus: A button that when clicked switches between dark and light aesthetics for user preference.
6.Collapsing button above Dashboard Menu button: A button that when clicked collapses the side menu and removes all words from the page and menu buttons with only the icon left behind.
​The Visuals & Aesthetics:
All the menu and page sorting buttons on the left, with the pages and menu opened at the rest of the space for clean, intuitive layout. The aesthetics should feel like a premium, hyper-modern dark-mode platform. The layout shape should be slightly light, thin-bordered panels and soft, generously rounded corners. Incorporate a vibrant color as the single accent color for primary buttons and active menu states. Typography must be a crisp, minimalist sans-serif with bold headings and muted body text, brought to life with quick, subtle hover transitions on all interactive elements to ensure the entire interface feels fluid and polished.
​The Logic System:
1.File Analysis: When analyzing files, have an AI summarize all text within the file, whether it is an image file (using OCR) or a permission-allowed spreadsheet, document, etc.
2.Formatted Export & Copying: The questions should follow a format specified by the target quiz sites such as Blooket and Gimkit when copying text or exporting. Specifically, when a user copies the text to their clipboard, strip out all structural labeling prefixes (e.g., do not include structural text words like "Question:", "Answer 1:", "Correct:", or anything similar to the following).
3.Strict Generation Flow Control: During generation, follow a strict sequential flow:
1.Generate the quiz questions.
2.Validate each generated question's location within the original input information.
3.If a question's source material is not found in the text, delete those questions and immediately loop back to regenerate.
4.If the questions pass validation and are successfully verified against the source text, proceed the user to the next page.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://canwinbuddy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/71c2f60e-089a-49b9-b4cd-81fc793e9ea1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
