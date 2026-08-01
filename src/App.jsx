// src/App.js
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { removeBackground } from '@imgly/background-removal';
import './App.css';

const MODEL_CONFIGS = {
  small: { name: 'Small (Fast)', size: '~40 MB', quality: 'Good', speed: 'Fast', model: 'small' },
  medium: { name: 'Medium (Balanced)', size: '~60 MB', quality: 'Better', speed: 'Medium', model: 'medium' },
  large: { name: 'Large (Best Quality)', size: '~80 MB', quality: 'Best', speed: 'Slow', model: 'large' }
};

const MODE_OPTIONS = [
  { id: 'transparent', name: 'Transparent', icon: '✨', desc: 'Remove background completely' },
  { id: 'color', name: 'Solid Color', icon: '🎨', desc: 'Replace background with color' },
  { id: 'blur', name: 'Blurred BG', icon: '💧', desc: 'Keep original background blurred' }
];

function App() {
  const [originalImage, setOriginalImage] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [rawProcessedBlob, setRawProcessedBlob] = useState(null);
  const [displayImage, setDisplayImage] = useState(null);
  const [processedFileSize, setProcessedFileSize] = useState(0);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('📸 Upload an image to get started');
  const [statusType, setStatusType] = useState('info');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedModel, setSelectedModel] = useState('small');
  const [processingTime, setProcessingTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // Storage and Cache State
  const [cachedModels, setCachedModels] = useState({ small: false, medium: false, large: false });
  const [cacheSize, setCacheSize] = useState(0);

  // Output Effect Options
  const [outputMode, setOutputMode] = useState('transparent');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [blurAmount, setBlurAmount] = useState(10);

  const fileInputRef = useRef(null);
  const startTimeRef = useRef(null);

  const revokeUrls = useCallback(() => {
    if (originalImage) URL.revokeObjectURL(originalImage);
    if (displayImage) URL.revokeObjectURL(displayImage);
  }, [originalImage, displayImage]);

  // Robust Cache Inspector: Checks Storage API, Cache Storage & IndexedDB
  const checkStorageAndModels = useCallback(async () => {
    let totalBytes = 0;
    const foundModels = { small: false, medium: false, large: false };

    // 1. Get Storage Quota & Usage
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        totalBytes = estimate.usage || 0;
      } catch (e) {
        console.warn('Storage estimate failed:', e);
      }
    }

    // 2. Check Cache Storage keys
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          if (name.includes('imgly') || name.includes('background-removal')) {
            const cache = await caches.open(name);
            const requests = await cache.keys();
            const urls = requests.map((r) => r.url.toLowerCase()).join(' ');

            if (urls.includes('small')) foundModels.small = true;
            if (urls.includes('medium')) foundModels.medium = true;
            if (urls.includes('large')) foundModels.large = true;
            if (requests.length > 0 && !urls.includes('medium') && !urls.includes('large')) {
              foundModels.small = true;
            }
          }
        }
      } catch (e) {
        console.warn('Cache Storage inspection failed:', e);
      }
    }

    // 3. Check IndexedDB fallback
    if (window.indexedDB) {
      try {
        await new Promise((resolve) => {
          const req = indexedDB.open('imgly-background-removal', 1);
          req.onsuccess = (e) => {
            const db = e.target.result;
            if (db.objectStoreNames.contains('files')) {
              const tx = db.transaction(['files'], 'readonly');
              const store = tx.objectStore('files');
              const keysReq = store.getAllKeys();
              keysReq.onsuccess = () => {
                const keys = (keysReq.result || []).join(' ').toLowerCase();
                if (keys.includes('small')) foundModels.small = true;
                if (keys.includes('medium')) foundModels.medium = true;
                if (keys.includes('large')) foundModels.large = true;
                if (keysReq.result?.length > 0 && !foundModels.medium && !foundModels.large) {
                  foundModels.small = true;
                }
                db.close();
                resolve();
              };
              keysReq.onerror = () => { db.close(); resolve(); };
            } else {
              db.close();
              resolve();
            }
          };
          req.onerror = () => resolve();
        });
      } catch (e) {
        console.warn('IndexedDB check failed:', e);
      }
    }

    setCachedModels(foundModels);
    setCacheSize(totalBytes);
  }, []);

  useEffect(() => {
    checkStorageAndModels();
  }, [checkStorageAndModels]);

  // Canvas Engine for Mode Adjustments
  const applyOutputMode = useCallback(async (fgBlob, bgFile, mode, color, blur) => {
    if (!fgBlob) return;

    if (mode === 'transparent') {
      const url = URL.createObjectURL(fgBlob);
      setDisplayImage((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setProcessedFileSize(fgBlob.size);
      return;
    }

    const fgImg = new Image();
    fgImg.src = URL.createObjectURL(fgBlob);
    await fgImg.decode();

    const canvas = document.createElement('canvas');
    canvas.width = fgImg.width;
    canvas.height = fgImg.height;
    const ctx = canvas.getContext('2d');

    if (mode === 'color') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(fgImg, 0, 0);
    } else if (mode === 'blur' && bgFile) {
      const bgImg = new Image();
      bgImg.src = URL.createObjectURL(bgFile);
      await bgImg.decode();

      ctx.save();
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.drawImage(fgImg, 0, 0);
      URL.revokeObjectURL(bgImg.src);
    }

    URL.revokeObjectURL(fgImg.src);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setDisplayImage((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setProcessedFileSize(blob.size);
      }
    }, 'image/png');
  }, []);

  useEffect(() => {
    if (rawProcessedBlob && originalFile) {
      applyOutputMode(rawProcessedBlob, originalFile, outputMode, bgColor, blurAmount);
    }
  }, [outputMode, bgColor, blurAmount, rawProcessedBlob, originalFile, applyOutputMode]);

  // Execute Background Processing
  const processImage = useCallback(async () => {
    if (!originalFile) return;

    setLoading(true);
    setProgress(0);
    setStatusType('info');
    startTimeRef.current = Date.now();

    try {
      const selectedConfig = MODEL_CONFIGS[selectedModel];
      const blob = await removeBackground(originalFile, {
        model: selectedConfig.model,
        numThreads: window.crossOriginIsolated ? 4 : 1,
        progress: (key, current, total) => {
          if (total > 0) {
            const pct = Math.round((current / total) * 100);
            setProgress(pct);
            const elapsed = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
            setProcessingTime(elapsed);

            if (key.includes('fetch') || key.includes('download')) {
              setStatus(`⬇️ Downloading ${selectedConfig.name} model... ${pct}%`);
            } else {
              setStatus(`🔄 Processing background with ${selectedConfig.name}... ${pct}% (${elapsed}s)`);
            }
          }
        }
      });

      setProgress(100);
      setRawProcessedBlob(blob);

      const totalTime = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
      setStatusType('success');
      setStatus(`✨ Completed in ${totalTime}s using ${selectedConfig.name}`);

      await checkStorageAndModels();
    } catch (error) {
      console.error('Error during image processing:', error);
      setStatusType('error');
      setStatus('❌ Failed to process image. Try selecting a smaller model.');
    } finally {
      setLoading(false);
    }
  }, [originalFile, selectedModel, checkStorageAndModels]);

  const handleFileUpload = useCallback(
    (file) => {
      if (!file || !file.type.startsWith('image/')) {
        alert('Please upload a valid image file');
        return;
      }

      revokeUrls();
      setRawProcessedBlob(null);
      setDisplayImage(null);
      setProcessedFileSize(0);
      setOriginalFile(file);

      const originalUrl = URL.createObjectURL(file);
      setOriginalImage(originalUrl);
      setStatus('⚙️ Options selected! Click "Process Image" below to run AI.');
      setStatusType('info');
    },
    [revokeUrls]
  );

  // Full Model & Storage Clear Action
  const clearAllModelCache = async () => {
    if (window.confirm('Clear all downloaded AI models and local storage?')) {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const key of keys) {
            await caches.delete(key);
          }
        }
        if (window.indexedDB) {
          indexedDB.deleteDatabase('imgly-background-removal');
        }
        setCachedModels({ small: false, medium: false, large: false });
        setCacheSize(0);
        setStatus('🗑️ All local model storage cleared.');
        setStatusType('info');
        setTimeout(checkStorageAndModels, 500);
      } catch (e) {
        console.error('Error clearing storage:', e);
      }
    }
  };

  const handleReset = () => {
    revokeUrls();
    setOriginalImage(null);
    setOriginalFile(null);
    setRawProcessedBlob(null);
    setDisplayImage(null);
    setProcessedFileSize(0);
    setProgress(0);
    setStatus('📸 Upload an image to get started');
    setStatusType('info');
    setLoading(false);
    setProcessingTime(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    checkStorageAndModels();
  };

  const handleDownload = () => {
    if (displayImage) {
      const link = document.createElement('a');
      link.href = displayImage;
      link.download = `bg-removed-${outputMode}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const hasAnyCache = Object.values(cachedModels).some(Boolean);

  return (
    <div className="app">
      <div className="bg-animation">
        <div className="orb orb1"></div>
        <div className="orb orb2"></div>
        <div className="orb orb3"></div>
      </div>

      <header className="header">
        <div className="header-content">
          <div className="header-top">
            <h1>
              <span className="gradient-text">Background Remover</span>
            </h1>
            <button
              className="settings-toggle"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings & Storage Management"
            >
              ⚙️
            </button>
          </div>
          <p>Remove or edit image backgrounds locally • 100% private</p>

          <div className="model-selector-bar">
            <span className="selector-label">Active Model:</span>
            <div className="model-pill-group">
              {Object.entries(MODEL_CONFIGS).map(([key, config]) => {
                const isDownloaded = cachedModels[key];
                const isActive = selectedModel === key;
                return (
                  <button
                    key={key}
                    className={`model-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedModel(key)}
                  >
                    {config.name}
                    {isDownloaded ? <span className="pill-badge">💾 Local</span> : <span className="pill-badge dim">☁️ Cloud</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel" onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="settings-content-panel">
            <div className="settings-header">
              <h3>⚙️ AI Models & Storage</h3>
              <button onClick={() => setShowSettings(false)}>✕</button>
            </div>

            <div className="settings-body">
              <div className="setting-group">
                <label>Model Configuration & Status</label>
                <div className="model-options">
                  {Object.entries(MODEL_CONFIGS).map(([key, config]) => {
                    const isDownloaded = cachedModels[key];
                    const isActive = selectedModel === key;
                    return (
                      <div
                        key={key}
                        className={`model-option ${isActive ? 'active' : ''}`}
                        onClick={() => setSelectedModel(key)}
                      >
                        <div className="model-name">
                          {config.name}
                          {isDownloaded && <span className="status-tag cached">💾 Downloaded</span>}
                        </div>
                        <div className="model-details">
                          <span>Est Size: {config.size}</span>
                          <span>Quality: {config.quality}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="setting-group">
                <label>Offline Storage Overview</label>
                <div className="model-status-info">
                  <div className="status-item">
                    <span>Total Storage Occupied:</span>
                    <span className="highlight-text">{formatSize(cacheSize)}</span>
                  </div>
                  <div className="status-item">
                    <span>Active Processing Engine:</span>
                    <span>{MODEL_CONFIGS[selectedModel]?.name}</span>
                  </div>
                </div>
              </div>

              <div className="setting-group">
                <div className="action-buttons-settings">
                  <button className="btn-danger" onClick={clearAllModelCache} disabled={!hasAnyCache && cacheSize === 0}>
                    🗑️ Clear Offline Models & Storage
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        {!originalImage ? (
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="drop-content">
              <div className="upload-icon">📤</div>
              <h2>Drop your image here</h2>
              <p>or click to select file</p>
              <div className="format-badges">
                <span>JPG</span>
                <span>PNG</span>
                <span>WebP</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e.target.files[0])}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        ) : (
          <div className="workspace">
            <div className={`status-bar ${statusType}`}>
              <span className="status-text">{status}</span>
            </div>

            {/* Workflow Mode Bar Options */}
            <div className="mode-selector-panel">
              <label className="mode-label">Target Background Style:</label>
              <div className="mode-buttons">
                {MODE_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    className={`mode-btn ${outputMode === m.id ? 'active' : ''}`}
                    onClick={() => setOutputMode(m.id)}
                  >
                    {m.icon} {m.name}
                  </button>
                ))}
              </div>

              {outputMode === 'color' && (
                <div className="mode-controls">
                  <label>Fill Color:</label>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="color-picker"
                  />
                </div>
              )}

              {outputMode === 'blur' && (
                <div className="mode-controls">
                  <label>Blur Amount: {blurAmount}px</label>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={blurAmount}
                    onChange={(e) => setBlurAmount(Number(e.target.value))}
                  />
                </div>
              )}
            </div>

            {loading && (
              <div className="progress-container">
                <div className="progress-header">
                  <span className="progress-label">AI Processing in Progress</span>
                  <span className="progress-percentage">{progress}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {!rawProcessedBlob && !loading && (
              <div className="process-trigger-container">
                <button className="btn btn-primary btn-large" onClick={processImage}>
                  ⚡ Process Image Now
                </button>
              </div>
            )}

            <div className="comparison-container">
              <div className="image-grid">
                <div className="image-card">
                  <div className="card-header">
                    <span className="card-label">Original</span>
                    <span className="file-size">{formatSize(originalFile?.size || 0)}</span>
                  </div>
                  <div className="image-wrapper">
                    <img src={originalImage} alt="Original input" />
                  </div>
                </div>

                <div className="vs-divider">
                  <span>VS</span>
                </div>

                <div className="image-card">
                  <div className="card-header">
                    <span className="card-label">Result ({outputMode})</span>
                    {processedFileSize > 0 && <span className="file-size">{formatSize(processedFileSize)}</span>}
                  </div>
                  <div className="image-wrapper checkerboard-bg">
                    {displayImage ? (
                      <img src={displayImage} alt="Processed output" />
                    ) : (
                      <div className="placeholder">
                        <p>{loading ? 'AI processing running...' : 'Click "Process Image Now" above'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="action-buttons">
                {displayImage && (
                  <>
                    <button className="btn btn-primary" onClick={handleDownload}>
                      💾 Download Result
                    </button>
                    <button className="btn btn-secondary" onClick={handleReset}>
                      🔄 New Image
                    </button>
                  </>
                )}
                {!displayImage && !loading && (
                  <button className="btn btn-secondary" onClick={handleReset}>
                    ↩ Cancel / Go Back
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <span>
            Client-Side Processing • Active Model: {MODEL_CONFIGS[selectedModel]?.name}{' '}
            {cachedModels[selectedModel] ? '(💾 Local)' : '(☁️ Cloud)'}
          </span>
        </div>
      </footer>
    </div>
  );
}
export default App;