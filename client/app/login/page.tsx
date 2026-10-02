'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setIsSubmitting(false);
      return;
    }
    router.push('/calendar');
  };

  return (
    <div style={containerStyle}>
      <Link href="/" style={backLinkStyle}>← Home</Link>
      <div style={cardStyle}>
        <h1 style={headingStyle}>Welcome back</h1>
        <p style={textStyle}>Log in to your Smart Calendar</p>
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div style={inputContainerStyle}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={inputStyle}
              required
            />
          </div>
          <div style={inputContainerStyle}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              style={inputStyle}
              required
            />
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          <button type="submit" disabled={isSubmitting} style={submitButtonStyle}>
            {isSubmitting ? 'Logging in…' : 'Log In'}
          </button>
        </form>
        <p style={{ ...textStyle, fontSize: '0.9rem', marginTop: '20px', marginBottom: 0 }}>
          Don't have an account? <Link href="/onboarding" style={{ color: '#1a1a1a', fontWeight: 700 }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}

const containerStyle = { position: 'relative' as const, minHeight: '100vh', backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif' };
const cardStyle = { backgroundColor: '#ffffff', borderRadius: '32px', padding: '40px', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', textAlign: 'center' as const, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' };
const headingStyle = { fontSize: '2rem', fontWeight: '800', color: '#1a1a1a', marginBottom: '8px', letterSpacing: '-1px' };
const textStyle = { fontSize: '1.05rem', color: '#333', marginBottom: '24px', lineHeight: '1.5' };
const inputContainerStyle = { width: '100%', marginBottom: '14px' };
const inputStyle = { width: '100%', padding: '18px 20px', borderRadius: '18px', border: 'none', backgroundColor: '#e5e5e5', fontSize: '1.05rem', textAlign: 'center' as const, outline: 'none', boxSizing: 'border-box' as const };
const submitButtonStyle = { width: '100%', padding: '16px', borderRadius: '22px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontSize: '1.05rem', fontWeight: '700', cursor: 'pointer', marginTop: '6px' };
const errorStyle = { color: '#e53e3e', fontSize: '0.9rem', marginBottom: '14px', marginTop: '-4px' };
const backLinkStyle = { position: 'absolute' as const, top: '24px', left: '24px', color: '#fff', fontSize: '0.95rem', fontWeight: 600, padding: '8px 14px', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.08)' };
