(() => {
    const $ = (id) => document.getElementById(id);
    const btnMain = $('btn-main'), btnReplay = $('btn-replay'), btnDelete = $('btn-delete');
    const mainIcon = $('main-icon'), replayIcon = $('replay-icon');
    const visualizer = $('visualizer'), statusEl = $('status');
    const howToBox = $('how-to-box');

    // Lucide icon paths
    const ICONS = {
        mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
        stop: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
        rewind: '<polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/>',
        play: '<polygon points="6 3 20 12 6 21 6 3"/>',
        pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'
    };

    const BAR_COUNT = 40;
    const bars = [];
    for (let i = 0; i < BAR_COUNT; i++) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        visualizer.appendChild(bar);
        bars.push(bar);
    }
    const levels = new Array(BAR_COUNT).fill(0.06);

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    const samples = new Uint8Array(analyser.fftSize);

    let mediaRecorder = null, micStream = null, micSource = null;
    let chunks = [];
    let normalBuffer = null, reversedBuffer = null;
    let state = 'idle'; // idle | recording | ready
    let playing = null; // { source, kind }
    let rafId = 0, lastPush = 0, startedAt = 0;

    function setIcon(svg, name) { svg.innerHTML = ICONS[name]; }

    function setStatus(text) { statusEl.textContent = text; }

    function formatTime(sec) {
        const s = Math.floor(sec);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function render() {
        const recording = state === 'recording';
        btnMain.classList.toggle('recording', recording);
        btnReplay.disabled = state !== 'ready';
        btnDelete.disabled = state === 'idle';
        const mainIconName = recording ? 'stop' : state === 'ready' ? 'rewind' : 'mic';
        setIcon(mainIcon, mainIconName);
        const title = recording ? 'Stop' : state === 'ready' ? 'Play reversed' : 'Record';
        btnMain.title = title;
        btnMain.setAttribute('aria-label', title);
        setIcon(replayIcon, playing && playing.kind === 'normal' ? 'pause' : 'play');
        visualizer.classList.toggle('recording', recording);
        visualizer.classList.toggle('playing', !!playing);
    }

    // WhatsApp-style scrolling level meter
    function tick(now) {
        rafId = requestAnimationFrame(tick);
        if (now - lastPush >= 60) {
            lastPush = now;
            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (let i = 0; i < samples.length; i++) {
                const v = (samples[i] - 128) / 128;
                sum += v * v;
            }
            const rms = Math.sqrt(sum / samples.length);
            levels.push(Math.min(1, Math.max(0.06, rms * 4)));
            levels.shift();
            bars.forEach((bar, i) => { bar.style.height = (levels[i] * 100) + '%'; });
            if (state === 'recording') setStatus('Recording ' + formatTime((performance.now() - startedAt) / 1000));
        }
    }

    function startMeter() {
        if (!rafId) rafId = requestAnimationFrame(tick);
    }

    function stopMeter() {
        cancelAnimationFrame(rafId);
        rafId = 0;
        levels.fill(0.06);
        bars.forEach((bar) => { bar.style.height = '6%'; });
    }

    function stopPlayback() {
        if (!playing) return;
        const { source } = playing;
        playing = null;
        source.onended = null;
        try { source.stop(); } catch (e) { /* already stopped */ }
        source.disconnect();
        stopMeter();
    }

    function play(buffer, kind) {
        stopPlayback();
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        source.onended = () => {
            if (playing && playing.source === source) {
                playing = null;
                stopMeter();
                setStatus('Ready');
                render();
            }
        };
        playing = { source, kind };
        source.start();
        setStatus(kind === 'normal' ? 'Playing normal' : 'Playing reversed');
        startMeter();
        render();
    }

    function reverseBuffer(buffer) {
        const out = audioContext.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            out.getChannelData(ch).set(buffer.getChannelData(ch));
            out.getChannelData(ch).reverse();
        }
        return out;
    }

    async function startRecording() {
        stopPlayback();
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.error(err);
            alert('Please allow microphone access.');
            return;
        }
        await audioContext.resume();
        mediaRecorder = new MediaRecorder(micStream);
        chunks = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = onRecordingStopped;
        micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(analyser); // analyser is not routed to output while recording
        analyser.disconnect();
        mediaRecorder.start();
        state = 'recording';
        startedAt = performance.now();
        startMeter();
        render();
    }

    async function onRecordingStopped() {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
        micSource.disconnect();
        micStream.getTracks().forEach((t) => t.stop());
        micSource = micStream = null;
        stopMeter();
        try {
            normalBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
            reversedBuffer = reverseBuffer(normalBuffer);
            state = 'ready';
            setStatus('Recorded ' + formatTime(normalBuffer.duration));
        } catch (err) {
            console.error(err);
            state = 'idle';
            setStatus('Could not read the recording');
        }
        render();
    }

    function reset() {
        if (state === 'recording') {
            mediaRecorder.onstop = null;
            mediaRecorder.stop();
            micSource.disconnect();
            micStream.getTracks().forEach((t) => t.stop());
            micSource = micStream = null;
        }
        stopPlayback();
        stopMeter();
        normalBuffer = reversedBuffer = null;
        state = 'idle';
        setStatus('Ready to record');
        render();
    }

    btnMain.onclick = async () => {
        await audioContext.resume();
        if (state === 'idle') startRecording();
        else if (state === 'recording') mediaRecorder.stop();
        else if (state === 'ready') {
            if (playing && playing.kind === 'reversed') stopPlayback(), setStatus('Ready'), render();
            else play(reversedBuffer, 'reversed');
        }
    };

    btnReplay.onclick = async () => {
        if (state !== 'ready') return;
        await audioContext.resume();
        if (playing && playing.kind === 'normal') {
            stopPlayback();
            setStatus('Ready');
            render();
        } else play(normalBuffer, 'normal');
    };

    btnDelete.onclick = reset;

    $('toggle-how-to').onclick = () => {
        howToBox.style.display = howToBox.style.display === 'block' ? 'none' : 'block';
    };

    setStatus('Ready to record');
    render();
})();
