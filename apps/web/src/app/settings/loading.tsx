export default function SettingsLoading() {
  return (
    <div style={{ padding: '2rem' }}>
      <div
        style={{
          height: '1.5rem',
          width: '8rem',
          background: '#18181b',
          borderRadius: '0.25rem',
          marginBottom: '2rem',
        }}
      />
      <div style={{ maxWidth: 600, display: 'grid', gap: '1rem' }}>
        <div
          style={{
            height: '5rem',
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '0.5rem',
          }}
        />
        <div
          style={{
            height: '10rem',
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '0.5rem',
          }}
        />
      </div>
    </div>
  );
}
