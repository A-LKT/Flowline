import { useCallback, useEffect, useRef } from 'react';
import MonacoEditor, { type Monaco } from '@monaco-editor/react';
import { buildExtraLib, type CompletionNode } from '../../engine/monacoCompletions';
import { useSettingsStore } from '../../state/settingsStore';
import { useSecretsStore } from '../../state/secretsStore';

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  language?: string;
  completionNodes?: CompletionNode[];
  readOnly?: boolean;
};

export const MonacoField = ({
  label,
  value,
  onChange,
  error,
  language = 'plaintext',
  completionNodes,
  readOnly = false,
}: Props) => {
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const theme          = useSettingsStore((s) => s.theme);
  const secretNames    = useSecretsStore((s) => s.names);

  const monacoRef    = useRef<Monaco | null>(null);
  const libHandleRef = useRef<{ dispose(): void } | null>(null);

  const registerLib = useCallback(
    (monaco: Monaco) => {
      if (language !== 'javascript') return;
      libHandleRef.current?.dispose();
      libHandleRef.current = monaco.languages.typescript.javascriptDefaults.addExtraLib(
        buildExtraLib(completionNodes ?? [], secretNames),
        'ts:workflow-context.d.ts',
      );
    },
    [language, completionNodes],
  );

  const handleMount = useCallback(
    (_editor: unknown, monaco: Monaco) => {
      monacoRef.current = monaco;
      registerLib(monaco);
    },
    [registerLib],
  );

  useEffect(() => {
    if (monacoRef.current) registerLib(monacoRef.current);
  }, [registerLib]);

  useEffect(() => () => { libHandleRef.current?.dispose(); }, []);

  return (
    <div className="field-row">
      <label className="field-label">{label}</label>
      <div className="monaco-wrap" data-error={error ? 'true' : undefined}>
        <MonacoEditor
          height="120px"
          defaultLanguage={language}
          value={value}
          onChange={(v) => onChange(v ?? '')}
          theme={theme === 'light' ? 'light' : 'vs-dark'}
          options={{
            minimap: { enabled: false },
            fontSize: editorFontSize,
            lineNumbers: 'off',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            readOnly,
          }}
          onMount={handleMount}
        />
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
};
