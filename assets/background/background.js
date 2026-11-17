(() => {
  'use strict';

  const GLYPHS = [
    '<svg width="162" height="162" viewBox="0 0 162 162" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M81 6.7998C91.4 6.7998 100.333 9.86668 107.8 16C115.266 22 121 30.533 125 41.5996C129 52.6663 131 65.8669 131 81.2002C131 96.3999 129 109.533 125 120.6C121 131.666 115.266 140.2 107.8 146.2C100.333 152.2 91.3999 155.2 81 155.2C70.7335 155.2 61.8001 152.2 54.2002 146.2C46.7335 140.2 41 131.666 37 120.6C33.0001 109.533 31 96.3999 31 81.2002C31 65.8669 33 52.6663 37 41.5996C41 30.533 46.7336 22 54.2002 16C61.8002 9.86668 70.7333 6.79981 81 6.7998ZM62.4414 129.772C62.9481 130.338 63.467 130.881 64 131.399C68.8 136.066 74.4667 138.399 81 138.399C87.6667 138.399 93.3333 136.066 98 131.399C102.8 126.733 106.467 120.133 109 111.6C111.667 102.933 113 92.7999 113 81.2002C113 69.3335 111.667 59.1329 109 50.5996C108.642 49.3764 108.261 48.1934 107.858 47.0498L62.4414 129.772ZM81 23.5996C74.4667 23.5996 68.8 25.933 64 30.5996C59.2 35.2663 55.4665 41.933 52.7998 50.5996C50.2665 59.1329 49 69.3335 49 81.2002C49 92.7999 50.2665 102.933 52.7998 111.6C53.1842 112.83 53.5918 114.019 54.0205 115.169L99.5557 32.2285C99.0508 31.6612 98.5328 31.1176 98 30.5996C93.3334 25.933 87.6666 23.5996 81 23.5996Z" fill="white"/></svg>',
    '<svg width="162" height="162" viewBox="0 0 162 162" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M95 135.2H129V152H33V135.2H77.7998V46.7998H40.5996V32H59.7998C64.8665 32 68.9333 31.2665 72 29.7998C75.2 28.3331 77.4665 25.9998 78.7998 22.7998C80.2664 19.5998 81 15.3333 81 10H95V135.2Z" fill="white"/></svg>',
    '<svg width="162" height="162" viewBox="0 0 162 162" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M41.4502 11C43.2079 11.0001 44.1953 11.7901 44.1953 13.5479V148.452C44.1953 150.21 43.2079 151 41.4502 151H22.7451C20.9872 151 20 150.21 20 148.452V13.5479C20 11.79 20.9873 11 22.7451 11H41.4502ZM141.018 11C142.815 11 143.427 12.5998 142.42 13.8047L91.9736 79.874C91.1639 80.8813 91.1638 81.0796 91.9736 82.0869H91.9541L142.42 148.156C143.427 149.361 142.815 150.961 141.018 150.961H115.696C114.492 150.961 113.681 150.368 113.089 149.559L62.623 82.6787C61.6159 81.4937 61.6158 80.486 62.623 79.2812L113.089 12.4023C113.701 11.5926 114.491 11 115.696 11H141.018Z" fill="white"/></svg>',
    '<svg width="162" height="162" viewBox="0 0 162 162" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M119.15 11C120.947 11 121.56 12.5998 120.552 13.8047L70.106 79.874C69.2963 80.8813 69.2962 81.0796 70.106 82.0869H70.0865L120.552 148.156C121.56 149.361 120.947 150.961 119.15 150.961H93.8287C92.6239 150.961 91.8138 150.368 91.2212 149.559L40.7554 82.6787C39.7482 81.4937 39.7481 80.486 40.7554 79.2812L91.2212 12.4023C91.8335 11.5926 92.6239 11 93.8287 11H119.15Z" fill="white"/></svg>',
    '<svg width="162" height="162" viewBox="0 0 162 162" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M155.033 136.252L89.9509 11H72.0819L7 136.252L15.9168 151H146.045L154.962 136.252H155.033Z" fill="white"/></svg>',
    '<svg width="162" height="162" viewBox="0 0 162 162" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M122 10.915H41L0.5 81.0001L41 151.085H122L162.5 81.0001L122 10.915Z" fill="white"/></svg>'
  ];

  const SAMPLE = { fps: 10, frameCount: 361, glyphCount: 6, width: 96, height: 77 };
  const RENDER_PARAMS = { spacing: 18, maxDiameter: 7, minShapeSize: 2, videoSpeed: 1 };
  const MAX_VISIBLE_GLYPHS = 14000;
  const VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    uniform vec2 u_resolution;
    varying vec2 v_texCoord;
    void main() {
      vec2 zeroToOne = a_position / u_resolution;
      vec2 clipSpace = zeroToOne * 2.0 - 1.0;
      gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;
  const FRAGMENT_SHADER = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform vec4 u_color;
    varying vec2 v_texCoord;
    void main() {
      vec4 glyph = texture2D(u_texture, v_texCoord);
      gl_FragColor = vec4(u_color.rgb, glyph.a * u_color.a);
    }
  `;

  function decodeSample(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const total = SAMPLE.width * SAMPLE.height * SAMPLE.frameCount;
    const output = new Uint8Array(total);
    let bit = 0;
    for (let n = 0; n < total; n++) {
      const byteIndex = bit >> 3;
      const bitOffset = bit & 7;
      const value = ((bytes[byteIndex] || 0) >> bitOffset) | ((bytes[byteIndex + 1] || 0) << (8 - bitOffset));
      output[n] = value & 7;
      bit += 3;
    }
    return output;
  }

  class AsciiRenderer {
    constructor(host) {
      this.host = host;
      this.color = [0, 119 / 255, 1, 1];
      this.vertexBufferData = new Float32Array(0);
      this.atlasEntries = [];
      this.width = 1;
      this.height = 1;
      this.columns = 1;
      this.rows = 1;
      this.sample = null;

      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        powerPreference: 'low-power'
      });
      if (!gl) throw new Error('WebGL unavailable');

      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) || 'shader failed');
        }
        return shader;
      };
      const vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'program failed');
      }

      this.canvas = canvas;
      this.gl = gl;
      this.program = program;
      this.texture = gl.createTexture();
      this.vertexBuffer = gl.createBuffer();
      this.positionLocation = gl.getAttribLocation(program, 'a_position');
      this.texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
      this.resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
      this.colorLocation = gl.getUniformLocation(program, 'u_color');

      canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(canvas);
      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    async buildAtlas() {
      const images = await Promise.all(GLYPHS.map(svg => new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG load failed')); };
        image.src = url;
      })));
      const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
      const cell = Math.ceil(120 * dpr);
      const columns = Math.max(1, Math.ceil(Math.sqrt(images.length)));
      const rows = Math.max(1, Math.ceil(images.length / columns));
      const padding = 12 * dpr;
      const size = cell - 2 * padding;
      const atlas = document.createElement('canvas');
      atlas.width = columns * cell;
      atlas.height = rows * cell;
      const context = atlas.getContext('2d');
      context.clearRect(0, 0, atlas.width, atlas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      this.atlasEntries = images.map((image, index) => {
        const x = (index % columns) * cell + padding;
        const y = Math.floor(index / columns) * cell + padding;
        context.drawImage(image, x, y, size, size);
        return { u0: x / atlas.width, v0: y / atlas.height, u1: (x + cell) / atlas.width, v1: (y + cell) / atlas.height };
      });
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    }

    resize() {
      const width = Math.max(this.host.offsetWidth, 1);
      const height = Math.max(this.host.offsetHeight, 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const renderWidth = Math.round(width * dpr);
      const renderHeight = Math.round(height * dpr);
      this.width = width;
      this.height = height;
      if (this.canvas.width !== renderWidth) this.canvas.width = renderWidth;
      if (this.canvas.height !== renderHeight) this.canvas.height = renderHeight;
      let columns = Math.max(1, Math.round(width / RENDER_PARAMS.spacing));
      let rows = Math.max(1, Math.round(height / RENDER_PARAMS.spacing));
      const total = columns * rows;
      if (total > MAX_VISIBLE_GLYPHS) {
        const scale = Math.sqrt(total / MAX_VISIBLE_GLYPHS);
        columns = Math.max(1, Math.floor(columns / scale));
        rows = Math.max(1, Math.floor(rows / scale));
      }
      this.columns = columns;
      this.rows = rows;
    }

    getCells(frameIndex) {
      const sample = this.sample;
      const cellWidth = this.width / this.columns;
      const cellHeight = this.height / this.rows;
      const cells = [];
      const aspect = this.columns / this.rows;
      const sampleAspect = sample.width / sample.height;
      let drawWidth = sample.width;
      let drawHeight = sample.height;
      let offsetX = 0;
      let offsetY = 0;
      if (sampleAspect > aspect) {
        drawWidth = sample.height * aspect;
        offsetX = (sample.width - drawWidth) / 2;
      } else if (sampleAspect < aspect) {
        drawHeight = sample.width / aspect;
        offsetY = (sample.height - drawHeight) / 2;
      }
      const frameBase = Math.min(sample.frameCount - 1, Math.max(0, frameIndex)) * sample.width * sample.height;
      for (let row = 0; row < this.rows; row++) {
        for (let column = 0; column < this.columns; column++) {
          const x = Math.min(sample.width - 1, Math.max(0, Math.floor(offsetX + ((column + 0.5) / this.columns) * drawWidth)));
          const y = Math.min(sample.height - 1, Math.max(0, Math.floor(offsetY + ((row + 0.5) / this.rows) * drawHeight)));
          const glyphIndex = sample.data[frameBase + y * sample.width + x];
          if (glyphIndex >= sample.glyphCount) continue;
          const intensity = Math.min(1, Math.max(0, (glyphIndex + 1) / sample.glyphCount));
          const size = RENDER_PARAMS.minShapeSize + intensity * (RENDER_PARAMS.maxDiameter - RENDER_PARAMS.minShapeSize);
          cells.push({ glyphIndex, x: (column + 0.5) * cellWidth, y: (row + 0.5) * cellHeight, size });
        }
      }
      return cells;
    }

    buildVertices(cells) {
      const needed = 24 * cells.length;
      if (this.vertexBufferData.length < needed) this.vertexBufferData = new Float32Array(Math.ceil(1.35 * needed));
      let offset = 0;
      for (const cell of cells) {
        const entry = this.atlasEntries[Math.min(this.atlasEntries.length - 1, Math.max(0, cell.glyphIndex))];
        const size = Math.max(1, cell.size + 4);
        const x0 = cell.x - size / 2;
        const y0 = cell.y - size / 2;
        const x1 = cell.x + size / 2;
        const y1 = cell.y + size / 2;
        this.vertexBufferData.set([
          x0, y0, entry.u0, entry.v0,
          x1, y0, entry.u1, entry.v0,
          x0, y1, entry.u0, entry.v1,
          x0, y1, entry.u0, entry.v1,
          x1, y0, entry.u1, entry.v0,
          x1, y1, entry.u1, entry.v1
        ], offset);
        offset += 24;
      }
      return offset;
    }

    render(frameIndex) {
      if (!this.atlasEntries.length || !this.sample) return;
      this.resize();
      const vertices = this.buildVertices(this.getCells(frameIndex));
      const gl = this.gl;
      this.color = document.documentElement.dataset.theme === 'dark' ? [0.36, 0.62, 1, 1] : [0, 119 / 255, 1, 1];
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexBufferData.subarray(0, vertices), gl.DYNAMIC_DRAW);
      const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(this.texCoordLocation);
      gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
      gl.uniform2f(this.resolutionLocation, this.width, this.height);
      gl.uniform4f(this.colorLocation, ...this.color);
      gl.drawArrays(gl.TRIANGLES, 0, vertices / 4);
    }

    dispose() {
      const gl = this.gl;
      gl.deleteBuffer(this.vertexBuffer);
      gl.deleteTexture(this.texture);
      gl.deleteProgram(this.program);
      const extension = gl.getExtension('WEBGL_lose_context');
      if (extension) extension.loseContext();
      this.canvas.remove();
    }
  }

  function init() {
    const host = document.getElementById('work-background');
    if (!host || !window.__KIMI_HERO_B64 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let renderer = null;
    let rafId = 0;
    let startTime = 0;
    let lastFrame = -1;
    let disposed = false;

    const frameAt = now => Math.floor(((now - startTime) * RENDER_PARAMS.videoSpeed / 1000) * SAMPLE.fps) % SAMPLE.frameCount;
    const tick = now => {
      rafId = 0;
      if (disposed || document.hidden || !renderer || !renderer.sample || !renderer.atlasEntries.length) return;
      const frame = frameAt(now);
      if (frame !== lastFrame) {
        renderer.render(frame);
        lastFrame = frame;
      }
      rafId = requestAnimationFrame(tick);
    };
    const start = () => {
      if (disposed || document.hidden || !renderer || !renderer.sample) return;
      if (!startTime) startTime = performance.now();
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };
    const onVisibility = () => document.hidden ? stop() : start();
    const onResize = () => {
      if (!renderer || !renderer.sample) return;
      renderer.render(frameAt(performance.now()));
      lastFrame = frameAt(performance.now());
    };
    const onPageHide = () => {
      disposed = true;
      stop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (renderer) renderer.dispose();
    };

    try {
      renderer = new AsciiRenderer(host);
    } catch (error) {
      console.warn('[FishDesk] 动态背景无法启动，已保留静态背景。', error);
      return;
    }
    renderer.buildAtlas().then(() => {
      if (disposed) return;
      renderer.sample = { ...SAMPLE, data: decodeSample(window.__KIMI_HERO_B64) };
      renderer.render(0);
      start();
    }).catch(error => console.warn('[FishDesk] 动态背景资源加载失败，已保留静态背景。', error));

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide, { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
