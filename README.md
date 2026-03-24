# Variables to CSS – Figma Plugin

**Variables to CSS** is a high-performance Figma plugin designed for developers and designers who want to bridge the gap between Figma design tokens and production-ready code. It allows you to transform Figma variables into clean, organized, and developer-friendly CSS Custom Properties with mathematical precision.

![Plugin Preview](/Thumbnail.png)

## ✨ Core Features

- **🚀 Instant Variable Extraction**: Automatically scans your Figma file for all available variable collections and their modes.
- **🎨 Color Format Support**: Export your color variables in the format that fits your stack:
  - **HEX**: Standard web colors.
  - **RGB (Raw)**: For easy manipulation with `rgba()`.
  - **OKLCH**: Modern, perceptually uniform color space for future-proof designs.
- **📏 Unit Conversion**: Seamlessly convert numeric variables (spacing, sizing, border-radius) between `px` and `rem`.
  - **Customizable Base Font Size**: Set your root font size (default 16px) for perfect REM calculations.
- **🏷️ Smart Naming Conventions**:
  - **Figma Name**: Keeps the original hierarchy from your layers.
  - **Code Syntax**: Sanitizes names into cleaner, hyphenated CSS variable names.
- **🌗 Mode Aware**: Export specific modes (e.g., Light vs. Dark) with automatic `:root` scoping.
- **💎 Premium UI**: A "Pixel-Perfect" interface built with React, Tailwind CSS, and shadcn/ui (Slate theme), inspired by modern design standards.

## 🛠️ Tech Stack

- **Frontend**: React + Tailwind CSS + [shadcn/ui](https://ui.shadcn.com/) (Slate Theme).
- **Icons**: Lucide React.
- **Build System**: Vite with `vite-plugin-singlefile` for a unified `ui.html`.
- **Language**: TypeScript (Strict typing for robust logic).

## 🚀 Getting Started

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/maxavend/variables-to-css-and-tailwind.git
   cd variables-to-css
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

To start the development server with hot-reloading:
```bash
npm run dev
```

To build the plugin for production (generates `dist/ui.html` and `code.js`):
```bash
npm run build
```

### Previewing the UI (Standalone Demo)

We have included a mock host to test the plugin UI without opening Figma. 
1. Run `npm run dev`.
2. Open `http://localhost:5173/server-ui-demo/index.html` in your browser.

## 🏗️ How to Use in Figma

1. Open Figma and go to **Plugins > Development > Import plugin from manifest...**.
2. Select the `manifest.json` file in the root of this project.
3. Run the "Variables to CSS" plugin.
4. Select the collections you want to extract and customize your preferences (Prefix, Color Format, Units).
5. Click **Run** and copy your generated CSS!

## 📄 License

This project is licensed under the MIT License.

---
*Developed with ❤️ by [Maximiliano Avendaño](https://github.com/maxavend)*
