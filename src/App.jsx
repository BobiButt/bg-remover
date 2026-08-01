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
  { id: 'transparent', name: 'Transparent', icon: '✨' },
  { id: 'color', name: 'Solid Color', icon: '🎨' },
  { id: 'blur', name: 'Blurred BG', icon: '💧' }
];

function App() {
  const [originalImage, setOriginalImage] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [rawProcessedBlob, setRawProcessedBlob] = useState(null);
  const [displayImage, setDisplayImage] = useState(null);
  const [processedFileSize, setProcessedFileSize] = useState(0);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('📸 Ready to upload an image');
  const [statusType, setStatusType] = useState('info');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedModel, setSelectedModel] = useState('small');
  const [processingTime, setProcessingTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // Per-model cache state map { small: boolean, medium: boolean, large: boolean }
  const [cachedModels, setCachedModels] = useState({ small: false, medium: false, large: false });
  const [cacheSize, setCacheSize] = useState(0);

  // Output Mode State
  const [outputMode, setOutputMode] = useState('transparent');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [blurAmount, setBlurAmount] = useState(10);

  const fileInputRef = useRef(null);
  const startTimeRef = useRef(null);

  const revokeUrls = useCallback(() => {
    if (originalImage) URL.revokeObjectURL(originalImage);
    if (displayImage) URL.revokeObjectURL(displayImage);
  }, [originalImage, displayImage]);

  // Inspects IndexedDB for specific @imgly model keys
  const checkIndexedDB = useCallback(() => {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve({ cachedMap: { small: false, medium: false, large: false }, totalSize: 0 });

      try {
        const request = indexedDB.open('imgly-background-removal', 1);
        request.onsuccess = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('files')) {
            db.close();
            return resolve({ cachedMap: { small: false, medium: false, large: false }, totalSize: 0 });
          }

          const transaction = db.transaction(['files'], 'readonly');
          const store = transaction.objectStore('files');
          const getAllKeysReq = store.getAllKeys();
          const getAllReq = store.getAll();

          let keys = [];
          let totalSize = 0;

          getAllKeysReq.onsuccess = () => {
            keys = getAllKeysReq.result || [];
          };

          getAllReq.onsuccess = () => {
            const blobs = getAllReq.result || [];
            blobs.forEach((item) => {
              if (item instanceof Blob) totalSize += item.size;
            });

            // Map downloaded keys to models
            const keyString = keys.join(' ').toLowerCase();
            const cachedMap = {
              small: keyString.includes('small') || (keys.length > 0 && !keyString.includes('medium') && !keyString.includes('large')),
              medium: keyString.includes('medium'),
              large: keyString.includes('large')
            };

            db.close();
            resolve({ cachedMap, totalSize });
          };

          getAllReq.onerror = () => {
            db.close();
            resolve({ cachedMap: { small: false, medium: false, large: false }, totalSize: 0 });
          };
        };

        request.onerror = () => resolve({ cachedMap: { small: false, medium: false, large: false }, totalSize: 0 });
      } catch (error) {
        resolve({ cachedMap: { small: false, medium: false, large: false }, totalSize: 0 });
      }
    });
  }, []);

  const checkModelCache = useCallback(async () => {
    try {
      const { cachedMap, totalSize } = await checkIndexedDB();
      setCachedModels(cachedMap);
      setCacheSize(totalSize);

      const isCurrentCached = cachedMap[selectedModel];
      if (!loading) {
        if (isCurrentCached) {
          setStatus(`✅ Selected AI Model [${MODEL_CONFIGS[selectedModel].name}] is ready (Cached)`);
          setStatusType('success');
        } else {
          setStatus(`📦 Selected Model [${MODEL_CONFIGS[selectedModel].name}] will download on first run`);
          setStatusType('info');
        }
      }
    } catch (error) {
      console.error('Error checking model cache:', error);
    }
  }, [checkIndexedDB, selectedModel, loading]);

  useEffect(() => {
    checkModelCache();
  }, [checkModelCache]);

  // Handle Model Switching directly from Dashboard / Settings
  const handleSelectModel = (modelKey) => {
    setSelectedModel(modelKey);
    const isCached = cachedModels[modelKey];
    if (isCached) {
      setStatus(`✅ Switched to ${MODEL_CONFIGS[modelKey].name} (Cached locally)`);
      setStatusType('success');
    } else {
      setStatus(`📦 Switched to ${MODEL_CONFIGS[modelKey].name} (Will download on process)`);
      setStatusType('info');
    }
  };

  // Canvas Compositing Engine for Output Modes
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

  const clearModelCache = async () => {
    if (window.confirm('Delete all cached AI models? They will be re-downloaded when selected.')) {
      try {
        if (window.indexedDB) {
          const request = indexedDB.deleteDatabase('imgly-background-removal');
          request.onsuccess = () => {
            setCachedModels({ small: false, medium: false, large: false });
            setCacheSize(0);
            setStatus('🗑️ All cached models cleared.');
            setStatusType('info');
            setTimeout(checkModelCache, 500);
          };
        }
      } catch (error) {
        console.error('Error clearing cache:', error);
      }
    }
  };

  const handleFileUpload = useCallback(
    async (file) => {
      if (!file || !file.type.startsWith('image/')) {
        alert('Please upload a valid image file');
        return;
      }

      revokeUrls();
      setRawProcessedBlob(null);
      setDisplayImage(null);
      setProcessedFileSize(0);
      setProgress(0);
      setLoading(true);
      setStatusType('info');
      startTimeRef.current = Date.now();
      setOriginalFile(file);

      const originalUrl = URL.createObjectURL(file);
      setOriginalImage(originalUrl);

      try {
        const selectedConfig = MODEL_CONFIGS[selectedModel];
        const blob = await removeBackground(file, {
          model: selectedConfig.model,
          progress: (key, current, total) => {
            if (total > 0) {
              const pct = Math.round((current / total) * 100);
              setProgress(pct);
              const elapsed = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
              setProcessingTime(elapsed);

              if (key.includes('fetch') || key.includes('download')) {
                setStatus(`⬇️ Downloading ${selectedConfig.name}... ${pct}%`);
              } else {
                setStatus(`🔄 Removing background using ${selectedConfig.name}... ${pct}% (${elapsed}s)`);
              }
            }
          }
        });

        setProgress(100);
        setRawProcessedBlob(blob);

        const totalTime = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
        setStatusType('success');
        setStatus(`✨ Done! Processed with [${selectedConfig.name}] in ${totalTime}s`);

        await checkModelCache();
      } catch (error) {
        console.error('Error processing image:', error);
        setStatusType('error');
        setStatus('❌ Failed to process image. Please try again.');
        setProgress(0);
      } finally {
        setLoading(false);
      }
    },
    [selectedModel, checkModelCache, revokeUrls]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files?.[0]) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    },
    [handleFileUpload]
  );

  const handleReset = () => {
    revokeUrls();
    setOriginalImage(null);
    setOriginalFile(null);
    setRawProcessedBlob(null);
    setDisplayImage(null);
    setProcessedFileSize(0);
    setProgress(0);
    setStatus('📸 Ready to upload an image');
    setStatusType('info');
    setLoading(false);
    setProcessingTime(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    checkModelCache();
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
    if (bytes === 0) return '0 B';
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
              title="Settings & Model Management"
            >
              ⚙️
            </button>
          </div>
          <p>Remove image backgrounds instantly • 100% private</p>

          {/* Local Model Switcher on Main Header */}
          <div className="model-selector-bar">
            <span className="selector-label">Active Model:</span>
            <div className="model-pill-group">
              {Object.entries(MODEL_CONFIGS).map(([key, config]) => {
                const isDownloaded = cachedModels[key];
                const isActive = selectedModel === key;
                return (
                  <button
                    key={key}
                    className={`model-pill ${isActive ? 'active' : ''} ${isDownloaded ? 'downloaded' : ''}`}
                    onClick={() => handleSelectModel(key)}
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
              <h3>⚙️ AI Model Management</h3>
              <button onClick={() => setShowSettings(false)}>✕</button>
            </div>

            <div className="settings-body">
              <div className="setting-group">
                <label>Downloaded Models & Selection</label>
                <div className="model-options">
                  {Object.entries(MODEL_CONFIGS).map(([key, config]) => {
                    const isDownloaded = cachedModels[key];
                    const isActive = selectedModel === key;
                    return (
                      <div
                        key={key}
                        className={`model-option ${isActive ? 'active' : ''}`}
                        onClick={() => handleSelectModel(key)}
                      >
                        <div className="model-name">
                          {config.name}
                          {isDownloaded && <span className="status-tag cached">💾 Downloaded</span>}
                        </div>
                        <div className="model-details">
                          <span>Size: {config.size}</span>
                          <span>Quality: {config.quality}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="setting-group">
                <label>Storage Summary</label>
                <div className="model-status-info">
                  <div className="status-item">
                    <span>IndexedDB Footprint:</span>
                    <span>{formatSize(cacheSize)}</span>
                  </div>
                  <div className="status-item">
                    <span>Active Selected Model:</span>
                    <span>{MODEL_CONFIGS[selectedModel]?.name}</span>
                  </div>
                </div>
              </div>

              <div className="setting-group">
                <div className="action-buttons-settings">
                  <button className="btn-danger" onClick={clearModelCache} disabled={!hasAnyCache}>
                    🗑️ Clear All Offline Models
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
            onDrop={handleDrop}
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

            {loading && (
              <div className="progress-container">
                <div className="progress-header">
                  <span className="progress-label">Processing</span>
                  <span className="progress-percentage">{progress}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {!loading && rawProcessedBlob && (
              <div className="mode-selector-panel">
                <label className="mode-label">Output Mode:</label>
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
                    <label>Background Color:</label>
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
                    <label>Blur Intensity: {blurAmount}px</label>
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
                        <div className="spinner"></div>
                        <p>Processing image...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="action-buttons">
                {displayImage && (
                  <>
                    <button className="btn btn-primary" onClick={handleDownload}>
                      Download Result
                    </button>
                    <button className="btn btn-secondary" onClick={handleReset}>
                      New Image
                    </button>
                  </>
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