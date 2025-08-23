import { useState } from "react";

export default function Dashboard() {
  const [globalSec, setGlobalSec] = useState(true);
  const [coreSec, setCoreSec] = useState(true);
  const [controlSec, setControlSec] = useState(false);

  return (
    <div className="dashboard">
      <h2>Dashboard Developer</h2>
      <table>
        <thead>
          <tr>
            <th>Keamanan</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Global</td>
            <td>
              <button onClick={() => setGlobalSec(!globalSec)}>
                {globalSec ? "✅" : "❌"}
              </button>
            </td>
          </tr>
          <tr>
            <td>Inti</td>
            <td>
              <button onClick={() => setCoreSec(!coreSec)}>
                {coreSec ? "✅" : "❌"}
              </button>
            </td>
          </tr>
          <tr>
            <td>Kontrol</td>
            <td>
              <button onClick={() => setControlSec(!controlSec)}>
                {controlSec ? "✅" : "❌"}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
