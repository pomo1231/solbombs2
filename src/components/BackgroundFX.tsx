import React from 'react';

export default function BackgroundFX() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Subtle moving gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-primary opacity-20" />

      {/* Radial spotlight from top center */}
      <div className="absolute -top-24 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full blur-3xl"
           style={{
             background:
               'radial-gradient(ellipse at center, rgba(20, 241, 149, 0.25), rgba(153, 69, 255, 0.12) 45%, rgba(0,0,0,0) 70%)'
           }}
      />

      {/* Fine grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.10) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0))'
        }}
      />

      {/* Corner glow accents */}
      <div className="absolute bottom-[-120px] right-[-120px] h-[360px] w-[360px] rounded-full blur-3xl"
           style={{ background: 'radial-gradient(circle at center, rgba(135, 82, 243, 0.25), rgba(0,0,0,0) 60%)' }}
      />
      <div className="absolute bottom-[10%] left-[-120px] h-[280px] w-[280px] rounded-full blur-3xl"
           style={{ background: 'radial-gradient(circle at center, rgba(20, 241, 149, 0.18), rgba(0,0,0,0) 60%)' }}
      />
    </div>
  );
}
