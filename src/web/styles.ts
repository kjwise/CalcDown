const STYLE_ID = "calcdown-styles";

export const CALCDOWN_BASE_CSS = `
.calcdown-root {
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: #111428;
}

.calcdown-root .muted {
  color: #6a718a;
  font-size: 12px;
}

.calcdown-root .view {
  border: 1px solid #e8eaf2;
  border-radius: 12px;
  background: #fbfcff;
  padding: 12px;
}

.calcdown-root .view-title {
  font-size: 12px;
  color: #6a718a;
  margin: 0 0 10px 0;
}

.calcdown-root .calcdown-doc {
  display: grid;
  gap: 12px;
}

.calcdown-root .calcdown-md {
  line-height: 1.55;
}

.calcdown-root .calcdown-md h1,
.calcdown-root .calcdown-md h2,
.calcdown-root .calcdown-md h3,
.calcdown-root .calcdown-md h4,
.calcdown-root .calcdown-md h5,
.calcdown-root .calcdown-md h6 {
  margin: 14px 0 8px 0;
}

.calcdown-root .calcdown-md p {
  margin: 0 0 12px 0;
}

.calcdown-root .calcdown-md ul,
.calcdown-root .calcdown-md ol {
  margin: 0 0 12px 20px;
  padding: 0;
}

.calcdown-root .calcdown-md hr {
  border: 0;
  border-top: 1px solid #e8eaf2;
  margin: 16px 0;
}

.calcdown-root .calcdown-md code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.95em;
  background: #f6f7fb;
  border: 1px solid #e8eaf2;
  border-radius: 6px;
  padding: 1px 5px;
}

.calcdown-root .calcdown-inputs {
  display: grid;
  gap: 10px;
}

.calcdown-root .calcdown-inputs .field {
  display: grid;
  gap: 6px;
}

.calcdown-root .calcdown-inputs .field label {
  font-size: 12px;
  color: #333;
}

.calcdown-root .calcdown-inputs .field input {
  padding: 8px 10px;
  border: 1px solid #d9dbe5;
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
}

.calcdown-root .calcdown-code {
  border: 1px dashed #d9dbe5;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
}

.calcdown-root .calcdown-code-title {
  font-size: 12px;
  color: #6a718a;
  margin: 0 0 8px 0;
}

.calcdown-root .calcdown-code pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.4;
}

.calcdown-root .cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.calcdown-root .card {
  border: 1px solid #e8eaf2;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}

.calcdown-root .card .k {
  font-size: 12px;
  color: #6a718a;
  margin-bottom: 6px;
}

.calcdown-root .card .v {
  font-size: 22px;
  font-weight: 650;
  color: #111428;
}

.calcdown-root table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}

.calcdown-root th,
.calcdown-root td {
  border-bottom: 1px solid #e8eaf2;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.calcdown-root th {
  color: #6a718a;
  font-weight: 600;
  background: #f6f7fb;
  position: sticky;
  top: 0;
}

.calcdown-root td input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid #d9dbe5;
  border-radius: 8px;
  font-size: 12px;
  background: #fff;
}

.calcdown-root .calcdown-messages {
  margin-top: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  background: #0b1020;
  color: #e7ebff;
  padding: 12px;
  border-radius: 10px;
  font-size: 12px;
}
`.trim();

export function installCalcdownStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CALCDOWN_BASE_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}
