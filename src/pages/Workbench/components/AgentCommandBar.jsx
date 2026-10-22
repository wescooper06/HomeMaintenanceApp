import { useEffect, useRef, useState } from "react";
import { AGENT_EXAMPLE, createAgentProject, parseCommand } from "../../../services/workbenchService.js";
import styles from "../WorkbenchPage.module.css";

export default function AgentCommandBar({ onCreated, disabled }) {
  const [command, setCommand] = useState("");
  const [response, setResponse] = useState(AGENT_EXAMPLE);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const parsed = parseCommand(command);
    if (parsed.intent === "help" || parsed.intent === "clear") {
      if (parsed.intent === "clear") setCommand("");
      setResponse(AGENT_EXAMPLE);
      return;
    }
    if (parsed.intent !== "create-project") {
      setResponse("I did not understand that command.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setResponse("Creating project...");
    try {
      const result = await createAgentProject(parsed);
      if (!mounted.current) return;
      setCommand("");
      setResponse(result.message);
      try {
        await onCreated(!result.local);
      } catch (error) {
        console.error("Agent project refresh failed", error);
        if (mounted.current) setResponse(`${result.message} Refresh failed: ${error.message}`);
      }
    } catch (error) {
      console.error("Agent command failed", error);
      if (mounted.current) setResponse(error.message || "Unable to create project.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <>
      <form className={styles.agentCommandBar} onSubmit={submit}>
        <input
          aria-label="Ask the Agent"
          className={styles.agentInput}
          type="text"
          placeholder="Ask the Agent..."
          autoComplete="off"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          disabled={disabled || busy}
        />
      </form>
      <div className={styles.agentResponse} role="status">{response}</div>
    </>
  );
}
