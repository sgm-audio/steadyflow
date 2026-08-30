'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';

const LoginErrorResponse = z.object({
  error: z.object({ message: z.string() }).optional(),
});

export default function LoginPage() {
  const [email, setEmail] = useState('dev@steadyflow.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = LoginErrorResponse.parse(await res.json());
        throw new Error(body.error?.message ?? 'Login failed');
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, padding: '2rem' }}>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: '1.5rem',
            textAlign: 'center',
          }}
        >
          SteadyFlow
        </h1>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div>
            <label
              htmlFor="email"
              style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              required
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label
              htmlFor="password"
              style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              required
              style={{ width: '100%' }}
            />
          </div>
          {error && <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.75rem',
              background: '#818cf8',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              fontWeight: 600,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
