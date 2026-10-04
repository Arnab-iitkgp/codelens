"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Volume2, VolumeX, Maximize2, Play, Pause } from "lucide-react";

export function InViewVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  // Smooth 60fps progress update via requestAnimationFrame
  useEffect(() => {
    const loop = () => {
      const video = videoRef.current;
      if (video && video.duration && !isDragging) {
        setProgress((video.currentTime / video.duration) * 100);
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isDragging]);

  // Autoplay on viewport enter, pause on leave
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => {
                video.muted = true;
                setIsMuted(true);
                video.play().then(() => setIsPlaying(true)).catch(() => {});
              });
          } else {
            video.pause();
            setIsPlaying(false);
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const seekFromClientX = useCallback((clientX: number) => {
    const bar = progressBarRef.current;
    const video = videoRef.current;
    if (!bar || !video || !video.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
    setProgress(ratio * 100);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    seekFromClientX(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    seekFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      seekFromClientX(e.clientX);
      setIsDragging(false);
    }
  };

  const handleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) {
      video.requestFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative z-10 w-full max-w-5xl mx-auto rounded-2xl border border-white/[0.1] bg-[#09090b] shadow-[0_30px_90px_rgba(0,0,0,0.7)] overflow-hidden group"
    >
      {/* Video Container (No fake website header, pure edge-to-edge frame) */}
      <div className="relative aspect-video w-full bg-[#0a0a0c] overflow-hidden">
        <video
          ref={videoRef}
          src="/video/codelens-launch-60s.mp4"
          poster="/video-poster.jpg"
          muted={isMuted}
          playsInline
          loop
          preload="metadata"
          onClick={togglePlay}
          className="w-full h-full object-cover cursor-pointer"
        />

        {/* Minimal Unmute / Sound Toggle in Top-Right */}
        <button
          onClick={toggleMute}
          type="button"
          className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 hover:bg-black/85 text-white text-xs font-medium backdrop-blur-md border border-white/15 shadow-lg transition-all cursor-pointer hover:scale-105"
          title={isMuted ? "Click to unmute" : "Mute sound"}
        >
          {isMuted ? (
            <>
              <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-zinc-200">Unmute</span>
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
              <span className="text-violet-300 font-medium">Sound On</span>
            </>
          )}
        </button>

        {/* Sleek Minimal Hover Controls Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-3 z-20">
          {/* Smooth Continuous Scrubber Bar */}
          <div
            ref={progressBarRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative w-full h-3 flex items-center cursor-pointer touch-none group/scrub"
          >
            {/* Background track */}
            <div className="w-full h-1 group-hover/scrub:h-1.5 bg-white/20 rounded-full transition-all overflow-hidden">
              {/* Active fill */}
              <div
                className="h-full bg-violet-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* Draggable scrub head */}
            <div
              className="absolute w-3 h-3 bg-white rounded-full shadow-md border border-violet-400 opacity-0 group-hover/scrub:opacity-100 transition-opacity pointer-events-none -ml-1.5"
              style={{ left: `${progress}%` }}
            />
          </div>

          {/* Bottom Bar Controls */}
          <div className="flex items-center justify-between text-white text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                type="button"
                className="hover:text-violet-400 transition-colors cursor-pointer p-1"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
              <button
                onClick={toggleMute}
                type="button"
                className="hover:text-violet-400 transition-colors cursor-pointer p-1"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <span className="font-mono text-zinc-400 text-[11px] ml-1">60s Tour</span>
            </div>

            <button
              onClick={handleFullscreen}
              type="button"
              className="hover:text-violet-400 transition-colors cursor-pointer p-1"
              aria-label="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
