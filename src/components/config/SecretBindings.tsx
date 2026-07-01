import { useEffect, useState } from "react";
import { auditSecretBindings } from "../../engines";
import type { McpServer, SecretBinding } from "../../engineTypes";
import { Icon } from "../Icon";

// Secret-binding manager (UI-FR15). Every SecretRef across all servers is listed as
// a `${VAR}` placeholder with its resolvability — a literal token value is never
// fetched or displayed (NFR2.4). audit_secret_bindings returns only resolvability,
// never a value, so a leak is impossible by construction.
export function SecretBindings({ servers }: { servers: McpServer[] }) {
  const [bindings, setBindings] = useState<SecretBinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(servers);

  useEffect(() => {
    let cancelled = false;
    auditSecretBindings(servers)
      .then((b) => !cancelled && (setBindings(b), setError(null)))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <section className="glass-card secret-bindings">
      <h4 className="card-title">
        <Icon name="key" /> Secret bindings
      </h4>

      {error && (
        <div className="callout callout-error">
          <Icon name="x" /> {error}
        </div>
      )}

      {bindings && bindings.length === 0 && !error && (
        <p className="card-sub">No secret references across these servers.</p>
      )}

      {bindings && bindings.length > 0 && (
        <ul className="secret-list">
          {bindings.map((b) => (
            <li key={b.envName} className="secret-item">
              <code className="secret-ref">${"{" + b.envName + "}"}</code>
              <span className="secret-flags">
                {b.fromKeychain && (
                  <span className="badge badge-neutral">
                    <Icon name="key" /> keychain
                  </span>
                )}
                {b.resolvable ? (
                  <span className="badge badge-success">
                    <Icon name="check" /> resolvable
                  </span>
                ) : (
                  <span className="badge badge-error">
                    <Icon name="alert" /> unresolved
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
