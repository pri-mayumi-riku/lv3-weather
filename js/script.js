/** 地点の一覧（名前・緯度・経度） */
const LOCATIONS = [
    { name: '東京', latitude: 35.68, longitude: 139.77 },
    { name: '横浜', latitude: 35.45, longitude: 139.64 },
    { name: '大阪', latitude: 34.69, longitude: 135.52 },
    { name: '名古屋', latitude: 35.18, longitude: 136.91 },
    { name: '札幌', latitude: 43.06, longitude: 141.35 },
    { name: '仙台', latitude: 38.27, longitude: 140.87 },
    { name: '福岡', latitude: 33.61, longitude: 130.42 },
    { name: '那覇', latitude: 26.21, longitude: 127.68 },
];

/**
 * 天気コードの対応表。
 * 天気の種類ごとに、日本語名・アイコン（絵文字）・天気コードの一覧をまとめる
 */
const WEATHER_GROUPS = [
    { label: '晴れ', icon: '☀️', codes: [0, 1] },
    { label: 'くもり', icon: '☁️', codes: [2, 3] },
    { label: '霧', icon: '🌫️', codes: [45, 48] },
    { label: '雨', icon: '☔️', codes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82] },
    { label: '雪', icon: '❄️', codes: [71, 73, 75, 77, 85, 86] },
    { label: '雷雨', icon: '⛈️', codes: [95, 96, 99] },
];

// HTML要素の取得
const locationSelect = document.getElementById('location-select');
const loadingArea = document.getElementById('loading');
const errorArea = document.getElementById('error');
const weatherArea = document.getElementById('weather');
const retryButton = document.getElementById('retry-button');

/** 最新の天気取得リクエストを識別するための番号 */
let latestRequestId = 0;

/**
 * 画面の天気データ表示エリアの状態を切り替える。
 * @param {'loading' | 'error' | 'weather'} state 表示エリアの状態
 */
function showState(state) {
    loadingArea.hidden = state !== 'loading';
    errorArea.hidden = state !== 'error';
    weatherArea.hidden = state !== 'weather';
}

/**
 * 天気コードから、天気の日本語名とアイコン（絵文字）を返す。
 * 対応表にないコードの場合は「不明」を返す。
 * @param {number} code 天気コード
 * @returns {{label: string, icon: string}} 天気の日本語名とアイコン
 */
function getWeatherInfo(code) {
    const group = WEATHER_GROUPS.find((g) => g.codes.includes(code));
    return group || { label: '不明', icon: '❓' };
}

/**
 * 降水確率（%）から、傘が必要かどうかのメッセージを返す。
 * @param {number} probability 降水確率（%）
 * @returns {string} メッセージ
 */
function getUmbrellaMessage(probability) {
    if (probability >= 70) {
        return 'しっかりとした傘が必要';
    } else if (probability >= 50) {
        return '傘を持っていくと安心';
    } else if (probability >= 20) {
        return '折りたたみ傘があれば安心';
    } else {
        return '傘の出番はほとんどなさそう';
    }
}

/**
 * 地点情報を受け取り、天気データ（JSON）を取得して返す。
 * 通信に失敗したとき、サーバーがエラーを返したとき、時間切れになったときは例外を投げる。
 * @param {{latitude: number, longitude: number}} place 地点情報（緯度・経度）
 * @returns {Promise<Object>} 天気データ
 */
async function fetchWeather(place) {
    const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        '&current=temperature_2m,weather_code' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&timezone=Asia%2FTokyo&forecast_days=2';

    // 10秒応答がなければ通信を中止する
    const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

/**
 * 今日または明日の1日分の天気をHTMLに表示する。
 * @param {'today' | 'tomorrow'} prefix HTMLの id の接頭辞（今日=「today」、明日=「tomorrow」）
 * @param {Object} daily 日別の天気データ
 * @param {number} i 日別データの番号（0=今日、1=明日）
 */
function renderDay(prefix, daily, i) {
    const info = getWeatherInfo(daily.weather_code[i]);
    const rainProb = daily.precipitation_probability_max[i];

    document.getElementById(`${prefix}-icon`).textContent = info.icon;
    document.getElementById(`${prefix}-label`).textContent = info.label;
    document.getElementById(`${prefix}-max`).textContent = Math.round(daily.temperature_2m_max[i]);
    document.getElementById(`${prefix}-min`).textContent = Math.round(daily.temperature_2m_min[i]);
    document.getElementById(`${prefix}-rain-prob`).textContent = rainProb;
    document.getElementById(`${prefix}-umbrella`).textContent = getUmbrellaMessage(rainProb);
}

/**
 * 天気データを受け取り、画面に表示する。
 * @param {Object} data 天気データ
 */
function renderWeather(data) {
    // 現在の天気
    const currentInfo = getWeatherInfo(data.current.weather_code);
    document.getElementById('current-icon').textContent = currentInfo.icon;
    document.getElementById('current-label').textContent = currentInfo.label;
    document.getElementById('current-temp').textContent = Math.round(data.current.temperature_2m);

    // 今日と明日の天気
    renderDay('today', data.daily, 0);
    renderDay('tomorrow', data.daily, 1);
}

/**
 * 選択中の地点の天気を取得して表示する。
 * 初回起動時、地点変更時、「もう一度試す」ボタン押下時に呼ばれる。
 */
async function loadWeather() {
    const place = LOCATIONS[locationSelect.value];
    const requestId = ++latestRequestId;
    showState('loading');
    try {
        const data = await fetchWeather(place);
        // 天気の取得中に新しい読み込みが始まっていたら、古い取得結果は捨てる
        if (requestId !== latestRequestId) {
            return;
        }
        renderWeather(data);
        showState('weather');
    } catch (error) {
        // 古い読み込みの失敗も画面には出さない
        if (requestId !== latestRequestId) {
            return;
        }
        console.error(error);
        showState('error');
    }
}

// 地点の選択肢を作る
LOCATIONS.forEach((place, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = place.name;
    locationSelect.appendChild(option);
});

// 地点変更時、「もう一度試す」ボタン押下時に天気データを取得し直す
locationSelect.addEventListener('change', loadWeather);
retryButton.addEventListener('click', loadWeather);

// 初回起動時に天気を取得して表示する
loadWeather();