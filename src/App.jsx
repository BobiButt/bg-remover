import React, { useState, useCallback, useRef, useEffect } from 'react';
import { removeBackground } from '@imgly/background-removal';
import './App.css';

function App() {
  const [originalFile, setOriginalFile] = useState(null);
  const [originalUrl, setOriginalUrl] = useState(null);
  const [blurredOriginalUrl, setBlurredOriginalUrl] = useState(null);
  
  const [rawCutoutBlob, setRawCutoutBlob] = useState(null);
  const [finalResultUrl, setFinalResultUrl] = useState(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('📸 Drop an image to transform it');
  const [statusType, setStatusType] = useState('info');

  // Customization controls
  const [activeTab, setActiveTab] = useState('original'); // 'original' | 'cutout'
  const [origBlur, setOrigBlur] = useState(0);
  
  const [bgStyle, setBgStyle] = useState('transparent'); // 'transparent' | 'color' | 'blur'
  const [solidColor, setSolidColor] = useState('#6366f1');
  const [bgBlur, setBgBlur] = useState(12);

  const fileInputRef = useRef(null);

  // Clean up Object URLs from memory
  const cleanupUrls = useCallback(() => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (blurredOriginalUrl) URL.revokeObjectURL(blurredOriginalUrl);
    if (finalResultUrl) URL.revokeObjectURL(finalResultUrl);
  }, [originalUrl, blurredOriginalUrl, finalResultUrl]);

  // Handle Input Image Upload
  const handleFileUpload = (file) => {
    if (!file?.type.startsWith('image/')) {
      alert('Please upload a valid image file');
      return;
    }
    cleanupUrls();
    setRawCutoutBlob(null);
    setFinalResultUrl(null);
    setOrigBlur(0);
    
    setOriginalFile(file);
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    setBlurredOriginalUrl(url);
    setStatus('✨ Image loaded! Apply blur or remove background below.');
    setStatusType('info');
  };

  // Render Blur on Original Image via Canvas
  useEffect(() => {
    if (!originalUrl) return;

    if (origBlur === 0) {
      setBlurredOriginalUrl(originalUrl);
      return;
    }

    const img = new Image();
    img.src = originalUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      ctx.filter = `blur(${origBlur}px)`;
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          const newUrl = URL.createObjectURL(blob);
          setBlurredOriginalUrl((prev) => {
            if (prev && prev !== originalUrl) URL.revokeObjectURL(prev);
            return newUrl;
          });
        }
      }, 'image/png');
    };
  }, [originalUrl, origBlur]);

  // AI Background Removal Execution
  const processAI = async () => {
    if (!originalFile) return;

    setLoading(true);
    setProgress(5);
    setStatusType('info');
    setStatus('⚡ Initializing fast AI engine...');

    try {
      const blob = await removeBackground(originalFile, {
        model: 'isnet_quint8',
        progress: (key, current, total) => {
          if (total > 0) {
            const pct = Math.round((current / total) * 100);
            setProgress(pct);
            setStatus(
              key.includes('download')
                ? `⬇️ Fetching AI weights... ${pct}%`
                : `✂️ Extracting subject... ${pct}%`
            );
          }
        },
      });

      setRawCutoutBlob(blob);
      setProgress(100);
      setStatusType('success');
      setStatus('🎉 Background removed successfully!');
      setActiveTab('cutout');
    } catch (err) {
      console.error(err);
      setStatusType('error');
      setStatus('❌ Failed to process image locally.');
    } finally {
      setLoading(false);
    }
  };

  // Compose Final AI Output
  const renderFinalResult = useCallback(async () => {
    if (!rawCutoutBlob || !originalUrl) return;

    if (bgStyle === 'transparent') {
      const url = URL.createObjectURL(rawCutoutBlob);
      setFinalResultUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      return;
    }

    const fgImg = new Image();
    fgImg.src = URL.createObjectURL(rawCutoutBlob);
    await fgImg.decode();

    const canvas = document.createElement('canvas');
    canvas.width = fgImg.width;
    canvas.height = fgImg.height;
    const ctx = canvas.getContext('2d');

    if (bgStyle === 'color') {
      ctx.fillStyle = solidColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(fgImg, 0, 0);
    } else if (bgStyle === 'blur') {
      const bgImg = new Image();
      bgImg.src = originalUrl;
      await bgImg.decode();

      ctx.save();
      ctx.filter = `blur(${bgBlur}px)`;
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.drawImage(fgImg, 0, 0);
      URL.revokeObjectURL(bgImg.src);
    }

    URL.revokeObjectURL(fgImg.src);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setFinalResultUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      }
    }, 'image/png');
  }, [rawCutoutBlob, originalUrl, bgStyle, solidColor, bgBlur]);

  useEffect(() => {
    renderFinalResult();
  }, [renderFinalResult]);

  // Download Trigger
  const downloadImage = (url, prefix = 'image') => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Reset Application
  const handleReset = () => {
    cleanupUrls();
    setOriginalFile(null);
    setOriginalUrl(null);
    setBlurredOriginalUrl(null);
    setRawCutoutBlob(null);
    setFinalResultUrl(null);
    setProgress(0);
    setStatus('📸 Drop an image to transform it');
    setStatusType('info');
    setActiveTab('original');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="app-container">
      {/* Dynamic Background Design */}
      <div className="gradient-glow glow-1"></div>
      <div className="gradient-glow glow-2"></div>

      <header className="app-header">
        <div className="brand-wrapper">
          <img src="/logo.png" alt="Bro Developer Logo" className="app-logo" />
          <h1>
            BG-Remover<span className="accent-text"> ( AI )</span>
          </h1>
        </div>
        <p>Ultra-fast client-side background removal & photo editing</p>
      </header>

      <main className="main-content">
        {!originalUrl ? (
          /* Dropzone */
          <div
            className="dropzone-card"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
            }}
          >
            <div className="dropzone-inner">
              <div className="icon-wrapper">🖼️</div>
              <h2>Choose an image or drag it here</h2>
              <p>Supports high-res PNG, JPG, WebP</p>
              <button className="btn btn-glow">Browse File</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFileUpload(e.target.files[0])}
              />
            </div>
          </div>
        ) : (
          /* Editor Layout */
          <div className="editor-layout">
            {/* Status Header */}
            <div className={`status-pill ${statusType}`}>{status}</div>

            {/* Progress Bar */}
            {loading && (
              <div className="progress-box">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
              </div>
            )}

            {/* Workspace Header Tabs */}
            <div className="tabs-header">
              <button
                className={`tab-btn ${activeTab === 'original' ? 'active' : ''}`}
                onClick={() => setActiveTab('original')}
              >
                1. Original & Quick Blur
              </button>
              <button
                className={`tab-btn ${activeTab === 'cutout' ? 'active' : ''}`}
                onClick={() => {
                  if (!rawCutoutBlob) processAI();
                  setActiveTab('cutout');
                }}
              >
                2. AI Cutout Studio {rawCutoutBlob ? '✨' : ''}
              </button>
            </div>

            {/* Tab 1: Original Image Editing */}
            {activeTab === 'original' && (
              <div className="tab-pane">
                <div className="control-bar">
                  <div className="slider-group">
                    <label>
                      💧 Original Blur: <span>{origBlur}px</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={origBlur}
                      onChange={(e) => setOrigBlur(Number(e.target.value))}
                    />
                  </div>

                  <div className="button-group">
                    <button
                      className="btn btn-secondary"
                      onClick={() => downloadImage(blurredOriginalUrl, 'blurred-original')}
                    >
                      💾 Download This Image
                    </button>
                    {!rawCutoutBlob && (
                      <button className="btn btn-primary" onClick={processAI} disabled={loading}>
                        ⚡ Remove Background Now
                      </button>
                    )}
                  </div>
                </div>

                <div className="preview-viewport">
                  <img src={blurredOriginalUrl || originalUrl} alt="Original preview" />
                </div>
              </div>
            )}

            {/* Tab 2: Cutout & Custom Background */}
            {activeTab === 'cutout' && (
              <div className="tab-pane">
                <div className="control-bar stacked">
                  <div className="style-pills">
                    <button
                      className={`pill ${bgStyle === 'transparent' ? 'active' : ''}`}
                      onClick={() => setBgStyle('transparent')}
                    >
                      ✨ Transparent
                    </button>
                    <button
                      className={`pill ${bgStyle === 'color' ? 'active' : ''}`}
                      onClick={() => setBgStyle('color')}
                    >
                      🎨 Solid Color
                    </button>
                    <button
                      className={`pill ${bgStyle === 'blur' ? 'active' : ''}`}
                      onClick={() => setBgStyle('blur')}
                    >
                      💧 Blurred Background
                    </button>
                  </div>

                  {bgStyle === 'color' && (
                    <div className="inline-control">
                      <label>Color Picker:</label>
                      <input
                        type="color"
                        value={solidColor}
                        onChange={(e) => setSolidColor(e.target.value)}
                        className="color-input"
                      />
                    </div>
                  )}

                  {bgStyle === 'blur' && (
                    <div className="slider-group">
                      <label>Background Blur: {bgBlur}px</label>
                      <input
                        type="range"
                        min="1"
                        max="50"
                        value={bgBlur}
                        onChange={(e) => setBgBlur(Number(e.target.value))}
                      />
                    </div>
                  )}

                  {finalResultUrl && (
                    <button
                      className="btn btn-primary"
                      onClick={() => downloadImage(finalResultUrl, `cutout-${bgStyle}`)}
                    >
                      💾 Download Cutout
                    </button>
                  )}
                </div>

                <div className="preview-viewport checkerboard-bg">
                  {finalResultUrl ? (
                    <img src={finalResultUrl} alt="AI Result Preview" />
                  ) : (
                    <div className="loading-placeholder">Processing AI Cutout...</div>
                  )}
                </div>
              </div>
            )}

            {/* Footer Action */}
            <div className="editor-footer">
              <button className="btn btn-outline" onClick={handleReset}>
                🔄 Start Over with New Image
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;