'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const totalSteps = 8;
  const [workTime, setWorkTime] = useState<'day' | 'night' | null>(null);
  const [workStyle, setWorkStyle] = useState<'social' | 'solo' | null>(null);
  const [favoriteColor, setFavoriteColor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [gcalEmail, setGcalEmail] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleFinish = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    setAuthError(null);

    try {
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setAuthError(error.message);
        setIsCompleting(false);
        return;
      }

      const userId = data.user?.id;
      if (userId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{
            id: userId,
            name,
            phone,
            work_time: workTime,
            work_style: workStyle,
            theme_color: favoriteColor,
            gcal_email: gcalEmail,
          }]);
        if (profileError) console.error('Error saving profile:', profileError);
      }

      router.push('/calendar');
    } catch (err) {
      setAuthError('Something went wrong. Please try again.');
      setIsCompleting(false);
    }
  };

  const handleGoogleConnect = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUri = `${siteUrl.replace(/\/$/, '')}/api/auth/callback`;
    const scope = 'https://www.googleapis.com/auth/calendar.readonly';
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&access_type=offline` +
      `&prompt=consent`;
    window.location.href = authUrl;
  };

  const renderStepContent = (currentStep: number) => {
    switch (currentStep) {
      case 1:
        return (
          <>
            <h2 style={headingStyle}>Welcome to Smart Calendar</h2>
            <p style={textStyle}>Let's create your account</p>
            <div style={buttonGroupStyle}>
              <button
                className="onboard-button onboard-button--primary"
                style={socialButtonStyle}
                onClick={() => setStep(2)}
              >
                Continue with Email
              </button>
              <button style={socialButtonStyle}>Continue with Google</button>
            </div>
            <p style={{ ...textStyle, fontSize: '0.9rem', marginTop: '20px', marginBottom: 0 }}>
              Already have an account? <Link href="/login" style={{ color: '#1a1a1a', fontWeight: 700 }}>Log in</Link>
            </p>
          </>
        );
      case 2:
        return (
          <>
            <h2 style={headingStyle}>Enter your name</h2>
            <div style={inputContainerStyle}>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" style={inputStyle} />
            </div>
          </>
        );
      case 3:
        return (
          <>
            <h2 style={headingStyle}>Email &amp; Password</h2>
            <div style={inputContainerStyle}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} />
            </div>
            <div style={inputContainerStyle}>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6 characters)" style={inputStyle} />
            </div>
          </>
        );
      case 4:
        return (
          <>
            <h2 style={headingStyle}>Phone Number</h2>
            <div style={inputContainerStyle}>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(123) 456-7890" style={inputStyle} />
            </div>
          </>
        );
      case 5:
        return (
          <>
            <h2 style={headingStyle}>When do you work best?</h2>
            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button onClick={() => setWorkTime('day')} style={{ padding: '1.2rem 1.8rem', borderRadius: '12px', border: '2px solid', borderColor: workTime === 'day' ? '#1a1a1a' : '#e5e5e5', backgroundColor: 'transparent', color: '#1a1a1a', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600 }}>Daytime</button>
              <button onClick={() => setWorkTime('night')} style={{ padding: '1.2rem 1.8rem', borderRadius: '12px', border: '2px solid', borderColor: workTime === 'night' ? '#1a1a1a' : '#e5e5e5', backgroundColor: 'transparent', color: '#1a1a1a', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600 }}>Night Owl</button>
            </div>
          </>
        );
      case 6:
        return (
          <>
            <h2 style={headingStyle}>What's your work style?</h2>
            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button onClick={() => setWorkStyle('social')} style={{ padding: '1.2rem 1.8rem', borderRadius: '12px', border: '2px solid', borderColor: workStyle === 'social' ? '#1a1a1a' : '#e5e5e5', backgroundColor: 'transparent', color: '#1a1a1a', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600 }}>Social</button>
              <button onClick={() => setWorkStyle('solo')} style={{ padding: '1.2rem 1.8rem', borderRadius: '12px', border: '2px solid', borderColor: workStyle === 'solo' ? '#1a1a1a' : '#e5e5e5', backgroundColor: 'transparent', color: '#1a1a1a', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600 }}>Solo</button>
            </div>
          </>
        );
      case 7:
        const colors = ['#b4dcc9', '#b2cde7', '#eabdb0', '#edd89a', '#dccdeb'];
        return (
          <>
            <h2 style={headingStyle}>Pick your theme color</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1.5rem', marginTop: '1.5rem', justifyItems: 'center' }}>
              {colors.map((color) => {
                const isSelected = favoriteColor === color;
                return (
                  <button key={color} onClick={() => setFavoriteColor(color)} style={{ width: '56px', height: '56px', borderRadius: '14px', border: '3px solid', borderColor: isSelected ? '#1a1a1a' : 'transparent', backgroundColor: color, cursor: 'pointer', transition: 'border-color 0.2s ease' }} />
                );
              })}
            </div>
          </>
        );
      case 8:
        return (
          <>
            <h2 style={headingStyle}>Google Calendar</h2>
            <p style={textStyle}>Connect your Google Calendar to import your events</p>
            <div style={buttonGroupStyle}>
              <button
                onClick={handleGoogleConnect}
                style={{
                  ...socialButtonStyle,
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Connect Google Calendar
              </button>
              <button
                onClick={handleFinish}
                style={{ ...socialButtonStyle, backgroundColor: '#e5e5e5', color: '#666' }}
              >
                Skip for now
              </button>
            </div>
            <p style={{ ...textStyle, fontSize: '0.85rem', marginTop: '1rem', color: '#999' }}>
              You can always connect later in settings
            </p>
          </>
        );
      default:
        return <h2 style={headingStyle}>Step {currentStep}</h2>;
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={progressContainerStyle}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} style={{ ...progressPillStyle, backgroundColor: i + 1 === step ? '#1a1a1a' : '#e0e0e0' }} />
            ))}
          </div>
          <button style={closeButtonStyle}>✕</button>
        </div>

        <div style={contentBodyStyle}>
          <h1 style={stepIndicatorStyle}>Step {step} of {totalSteps}</h1>
          {renderStepContent(step)}
          {authError && <p style={{ color: '#e53e3e', fontSize: '0.9rem', marginTop: '10px' }}>{authError}</p>}
          {step > 1 && step < totalSteps && (
            <button onClick={() => setStep(step + 1)} style={{ ...nextButtonStyle, marginTop: '22px' }}>
              Continue
            </button>
          )}
        </div>

        <div style={navStyle}>
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)} style={secondaryButtonStyle}>Previous</button>
          ) : <div />}

          {step === totalSteps && (
            <button onClick={handleFinish} style={nextButtonStyle}>Finish</button>
          )}
        </div>
      </div>
    </div>
  );
}

const containerStyle = { minHeight: '100vh', backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif' };
const cardStyle = { backgroundColor: '#ffffff', borderRadius: '32px', padding: '40px', width: '100%', maxWidth: '520px', minHeight: '580px', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '50px' };
const progressContainerStyle = { display: 'flex', gap: '8px', flex: 1, marginRight: '20px' };
const progressPillStyle = { height: '5px', flex: 1, borderRadius: '10px', transition: 'all 0.3s ease' };
const closeButtonStyle = { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#000', padding: '5px' };
const contentBodyStyle = { flex: 1, textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center' };
const stepIndicatorStyle = { fontSize: '1.6rem', fontWeight: '800', color: '#1a1a1a', marginBottom: '40px', letterSpacing: '-0.5px' };
const headingStyle = { fontSize: '2rem', fontWeight: '800', color: '#1a1a1a', marginBottom: '16px', letterSpacing: '-1px' };
const textStyle = { fontSize: '1.1rem', color: '#333', marginBottom: '30px', lineHeight: '1.5' };
const buttonGroupStyle = { display: 'flex', flexDirection: 'column' as const, gap: '12px', width: '100%' };
const socialButtonStyle = { padding: '20px', borderRadius: '24px', border: 'none', backgroundColor: '#e5e5e5', color: '#000', fontSize: '1.1rem', fontWeight: '600', cursor: 'pointer', transition: 'background 0.2s' };
const inputContainerStyle = { width: '100%', marginTop: '10px' };
const inputStyle = { width: '100%', padding: '30px', borderRadius: '28px', border: 'none', backgroundColor: '#e5e5e5', fontSize: '1.1rem', textAlign: 'center' as const, outline: 'none' };
const navStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '30px' };
const nextButtonStyle = { padding: '14px 32px', borderRadius: '22px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontSize: '1.05rem', fontWeight: '700', cursor: 'pointer' };
const secondaryButtonStyle = { background: 'none', border: 'none', color: '#1a1a1a', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' };