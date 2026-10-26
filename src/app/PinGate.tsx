import { useState } from "react";
import { vault } from "../data/vault";
import { requestPersistentStorage } from "../data/exchange";

export function PinGate() {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = !vault.isSetUp;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    if (setup) {
      if (pin.length < 4) { setError("PIN mindestens 4 Zeichen."); setBusy(false); return; }
      if (pin !== pin2) { setError("PINs stimmen nicht überein."); setBusy(false); return; }
      await vault.setup(pin);
      await requestPersistentStorage();
    } else {
      const ok = await vault.unlock(pin);
      if (!ok) { setError("Falsche PIN."); setBusy(false); return; }
    }
    setPin(""); setPin2("");
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 bg-white p-6 rounded-2xl shadow-sm border">
        <h1 className="text-xl font-semibold">tinkeredu</h1>
        <p className="text-sm text-neutral-500">
          {setup
            ? "PIN festlegen. Sie verschlüsselt alle Daten — ohne PIN sind die Daten unleserlich. Eine vergessene PIN bedeutet Datenverlust."
            : "PIN eingeben zum Entsperren."}
        </p>
        <input
          type="password" inputMode="numeric" autoFocus
          className="w-full border rounded-lg px-4 py-3 text-lg tracking-widest"
          placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)}
        />
        {setup && (
          <input
            type="password" inputMode="numeric"
            className="w-full border rounded-lg px-4 py-3 text-lg tracking-widest"
            placeholder="PIN wiederholen" value={pin2} onChange={(e) => setPin2(e.target.value)}
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit" disabled={busy}
          className="w-full min-h-11 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50"
        >
          {setup ? "Einrichten" : "Entsperren"}
        </button>
      </form>
    </div>
  );
}
