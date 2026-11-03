import { useState } from "react";
import "./App.css";

const sections = ["Create", "Upscale", "History", "Gallery"] as const;

export default function App() {
  const [section, setSection] = useState<(typeof sections)[number]>("Create");

  return (
    <div className="app">
      <nav className="navigation" aria-label="Workspace">
        <strong className="brand">LutriUI</strong>
        {sections.map((item) => (
          <button
            key={item}
            type="button"
            aria-current={section === item ? "page" : undefined}
            onClick={() => setSection(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <main className="workspace">
        <h1>{section}</h1>
      </main>
    </div>
  );
}
