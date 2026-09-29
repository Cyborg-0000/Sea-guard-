/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        marine: {
          bg: '#071018',       // Base 1
          panel: '#0B141D',    // Base 2
          border: '#101C26',   // Base 3
          text: '#E6EDF3',     // Text Primary
          muted: '#AAB8C5',    // Text Secondary
          tertiary: '#6F8292', // Text Tertiary
          
          // Semantic Colors
          green: '#22C55E',    // Verified / Healthy
          amber: '#F59E0B',    // Warning / Candidate / Simulation
          red: '#EF4444',      // Critical / Blocked
          blue: '#38BDF8',     // Computed / Analytical
          purple: '#A78BFA',   // Historical
          teal: '#34D399',     // Real Historical
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
