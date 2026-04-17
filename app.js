// ===== 配置 =====
const SUPABASE_URL = 'https://aczkmjqmlndtpufdbfbq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FZGD4SOCvbtmzbU-gkDmwg_Z4IstazO';
const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY'; // 需要替換

// 初始化 Supabase
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== 全局變數 =====
let currentTripId = null;
let currentDayDate = null;
let currentActivityId = null;
let currentCredentialId = null;
let map = null;
let directionsService = null;
let directionsRenderer = null;
let markers = [];
let placesService = null;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('應用初始化中...');
    
    // 初始化 Google Maps
    initializeMap();
    
    // 初始化事件監聽
    initializeEventListeners();
    
    // 加載現有行程
    await loadTrips();
});

// ===== Google Maps 初始化 =====
function initializeMap() {
    const mapElement = document.getElementById('map');
    
    map = new google.maps.Map(mapElement, {
        zoom: 13,
        center: { lat: 25.0330, lng: 121.5654 }, // 台灣默認位置
        styles: [
            {
                featureType: 'all',
                elementType: 'labels',
                stylers: [{ visibility: 'on' }]
            }
        ]
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: false,
        polylineOptions: {
            strokeColor: '#3b82f6',
            strokeWeight: 3
        }
    });

    placesService = new google.maps.places.PlacesService(map);
}

// ===== 事件監聽 =====
function initializeEventListeners() {
    // 行程管理
    document.getElementById('createTripBtn').addEventListener('click', createNewTrip);
    document.getElementById('tripSelect').addEventListener('change', selectTrip);
    document.getElementById('updateDatesBtn').addEventListener('click', updateTripDates);

    // 日期選擇
    document.getElementById('startDate').addEventListener('change', updateDaysList);
    document.getElementById('endDate').addEventListener('change', updateDaysList);

    // 活動管理
    document.getElementById('addActivityBtn').addEventListener('click', openActivityModal);
    document.getElementById('activityForm').addEventListener('submit', saveActivity);
    document.getElementById('deleteActivityBtn').addEventListener('click', deleteActivity);
    document.getElementById('addCredentialBtn').addEventListener('click', addCredentialField);

    // 憑證管理
    document.getElementById('credentialForm').addEventListener('submit', saveCredential);

    // 地圖操作
    document.getElementById('showRouteBtn').addEventListener('click', showRoute);
    document.getElementById('clearRouteBtn').addEventListener('click', clearRoute);

    // Modal 關閉
    document.querySelectorAll('.close, .close-modal').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    // 位置搜尋
    document.getElementById('activityLocation').addEventListener('input', searchLocations);
}

// ===== 行程操作 =====
async function createNewTrip() {
    const tripName = document.getElementById('tripName').value.trim();
    
    if (!tripName) {
        showToast('請輸入行程名稱', 'error');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('trips')
            .insert([{
                name: tripName,
                created_by: await getCurrentUserId(),
                collaborators: [await getCurrentUserId()],
                status: 'draft'
            }])
            .select();

        if (error) throw error;

        currentTripId = data[0].id;
        document.getElementById('tripName').value = '';
        
        showToast('行程已建立', 'success');
        await loadTrips();
        
    } catch (error) {
        console.error('建立行程失敗:', error);
        showToast('建立行程失敗', 'error');
    }
}

async function loadTrips() {
    try {
        const { data, error } = await supabase
            .from('trips')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const select = document.getElementById('tripSelect');
        select.innerHTML = '<option value="">選擇現有行程</option>';

        data.forEach(trip => {
            const option = document.createElement('option');
            option.value = trip.id;
            option.textContent = trip.name;
            select.appendChild(option);
        });

        // 訂閱行程更新
        subscribeToTrips();

    } catch (error) {
        console.error('加載行程失敗:', error);
    }
}

async function selectTrip(event) {
    const tripId = event.target.value;
    
    if (!tripId) {
        currentTripId = null;
        return;
    }

    currentTripId = tripId;

    try {
        const { data, error } = await supabase
            .from('trips')
            .select('*')
            .eq('id', tripId)
            .single();

        if (error) throw error;

        // 設置日期
        document.getElementById('startDate').value = data.start_date || '';
        document.getElementById('endDate').value = data.end_date || '';

        // 更新協作者
        updateCollaboratorsList(data.collaborators);

        // 加載日期列表
        await updateDaysList();

        // 訂閱活動更新
        subscribeToActivities();

    } catch (error) {
        console.error('選擇行程失敗:', error);
    }
}

async function updateTripDates() {
    if (!currentTripId) {
        showToast('請先選擇行程', 'error');
        return;
    }

    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
        showToast('請選擇開始和結束日期', 'error');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        showToast('開始日期不能晚於結束日期', 'error');
        return;
    }

    try {
        const { error } = await supabase
            .from('trips')
            .update({
                start_date: startDate,
                end_date: endDate
            })
            .eq('id', currentTripId);

        if (error) throw error;

        await updateDaysList();
        showToast('日期已更新', 'success');

    } catch (error) {
        console.error('更新日期失敗:', error);
        showToast('更新日期失敗', 'error');
    }
}

function updateCollaboratorsList(collaborators) {
    const element = document.getElementById('collaborators');
    element.textContent = `👥 ${collaborators.length} 位協作者`;
    element.title = collaborators.join(', ');
}

// ===== 日期管理 =====
async function updateDaysList() {
    if (!currentTripId) return;

    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
        document.getElementById('daysList').innerHTML = '';
        return;
    }

    const days = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d).toISOString().split('T')[0]);
    }

    const daysList = document.getElementById('daysList');
    daysList.innerHTML = days.map((day, index) => `
        <div class="day-item" data-date="${day}">
            <div class="day-date">第 ${index + 1} 天</div>
            <div class="day-label">${formatDate(day)}</div>
        </div>
    `).join('');

    // 綁定日期點擊事件
    document.querySelectorAll('.day-item').forEach(item => {
        item.addEventListener('click', async () => {
            currentDayDate = item.dataset.date;
            
            document.querySelectorAll('.day-item').forEach(d => d.classList.remove('active'));
            item.classList.add('active');

            updateCurrentDayTitle();
            await loadActivities();
        });
    });
}

function updateCurrentDayTitle() {
    if (!currentDayDate) {
        document.getElementById('currentDayTitle').textContent = '選擇日期';
        return;
    }

    const title = `${formatDate(currentDayDate)} (${getWeekday(currentDayDate)})`;
    document.getElementById('currentDayTitle').textContent = title;
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('zh-TW', {
        month: '2-digit',
        day: '2-digit'
    });
}

function getWeekday(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return '星期' + weekdays[date.getDay()];
}

// ===== 活動管理 =====
async function loadActivities() {
    if (!currentTripId || !currentDayDate) return;

    try {
        const { data, error } = await supabase
            .from('activities')
            .select('*, credentials(*)')
            .eq('trip_id', currentTripId)
            .eq('date', currentDayDate)
            .order('start_time', { ascending: true });

        if (error) throw error;

        renderActivities(data);
        updateMapMarkers(data);

    } catch (error) {
        console.error('加載活動失敗:', error);
    }
}

function renderActivities(activities) {
    const container = document.getElementById('activitiesList');
    
    if (activities.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; margin-top: 20px;">此日期暫無行程</p>';
        return;
    }

    container.innerHTML = activities.map(activity => `
        <div class="activity-card" data-id="${activity.id}">
            <button class="activity-delete-btn" data-id="${activity.id}">✕</button>
            <div class="activity-time">${activity.start_time} ~ ${activity.end_time}</div>
            <div class="activity-name">${activity.name}</div>
            <div class="activity-location">${activity.location}</div>
            
            ${activity.description ? `<div style="font-size: 13px; color: #666; margin-bottom: 8px;">${activity.description}</div>` : ''}
            
            ${activity.credentials && activity.credentials.length > 0 ? `
                <div class="activity-credentials">
                    ${activity.credentials.map(cred => `
                        <a href="${cred.url}" target="_blank" class="credential-link">
                            ${getCredentialIcon(cred.type)} ${cred.name}
                        </a>
                    `).join('')}
                </div>
            ` : ''}
            
            ${activity.cost ? `<div class="activity-cost">💰 USD $${activity.cost.toFixed(2)}</div>` : ''}
            <div class="activity-editors">編輯者: ${activity.edited_by || '未知'}</div>
        </div>
    `).join('');

    // 綁定事件
    document.querySelectorAll('.activity-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('activity-delete-btn')) {
                openActivityModal(card.dataset.id);
            }
        });
    });

    document.querySelectorAll('.activity-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteActivity(btn.dataset.id);
        });
    });
}

function getCredentialIcon(type) {
    const icons = {
        'hotel': '🏨',
        'flight': '✈️',
        'ticket': '🎫',
        'restaurant': '🍽️',
        'car': '🚗',
        'other': '📎'
    };
    return icons[type] || '📎';
}

async function openActivityModal(activityId = null) {
    if (!currentTripId || !currentDayDate) {
        showToast('請先選擇日期', 'error');
        return;
    }

    currentActivityId = activityId;
    const form = document.getElementById('activityForm');
    const modal = document.getElementById('activityModal');
    const deleteBtn = document.getElementById('deleteActivityBtn');

    // 重置表單
    form.reset();
    document.getElementById('credentialsList').innerHTML = '';

    if (activityId) {
        // 加載現有活動
        try {
            const { data, error } = await supabase
                .from('activities')
                .select('*, credentials(*)')
                .eq('id', activityId)
                .single();

            if (error) throw error;

            document.getElementById('activityName').value = data.name;
            document.getElementById('activityStartTime').value = data.start_time;
            document.getElementById('activityEndTime').value = data.end_time;
            document.getElementById('activityLocation').value = data.location;
            document.getElementById('activityLng').value = data.lng;
            document.getElementById('activityLat').value = data.lat;
            document.getElementById('activityDescription').value = data.description || '';
            document.getElementById('activityCost').value = data.cost || '';
            document.getElementById('activityNotes').value = data.notes || '';

            // 加載憑證
            if (data.credentials && data.credentials.length > 0) {
                data.credentials.forEach(cred => {
                    addCredentialField(cred);
                });
            }

            deleteBtn.style.display = 'block';

        } catch (error) {
            console.error('加載活動失敗:', error);
            showToast('加載活動失敗', 'error');
        }
    } else {
        deleteBtn.style.display = 'none';
    }

    modal.classList.add('show');
}

async function saveActivity(e) {
    e.preventDefault();

    if (!currentTripId || !currentDayDate) return;

    const activityData = {
        trip_id: currentTripId,
        date: currentDayDate,
        name: document.getElementById('activityName').value,
        start_time: document.getElementById('activityStartTime').value,
        end_time: document.getElementById('activityEndTime').value,
        location: document.getElementById('activityLocation').value,
        lng: parseFloat(document.getElementById('activityLng').value),
        lat: parseFloat(document.getElementById('activityLat').value),
        description: document.getElementById('activityDescription').value,
        cost: parseFloat(document.getElementById('activityCost').value) || null,
        notes: document.getElementById('activityNotes').value,
        edited_by: await getCurrentUserId(),
        edited_at: new Date().toISOString()
    };

    // 驗證
    if (!activityData.name || !activityData.start_time || !activityData.end_time || !activityData.location) {
        showToast('請填寫所有必填欄位', 'error');
        return;
    }

    if (activityData.lng === 0 || activityData.lat === 0) {
        showToast('請選擇有效的地點', 'error');
        return;
    }

    try {
        let activityId;

        if (currentActivityId) {
            // 更新
            const { error } = await supabase
                .from('activities')
                .update(activityData)
                .eq('id', currentActivityId);

            if (error) throw error;
            activityId = currentActivityId;

        } else {
            // 創建
            const { data, error } = await supabase
                .from('activities')
                .insert([activityData])
                .select();

            if (error) throw error;
            activityId = data[0].id;
        }

        // 保存憑證
        await saveCredentials(activityId);

        showToast('活動已保存', 'success');
        closeModals();
        await loadActivities();

    } catch (error) {
        console.error('保存活動失敗:', error);
        showToast('保存活動失敗', 'error');
    }
}

async function deleteActivity(activityId) {
    if (!confirm('確定要刪除此活動嗎？')) return;

    try {
        const { error } = await supabase
            .from('activities')
            .delete()
            .eq('id', activityId);

        if (error) throw error;

        showToast('活動已刪除', 'success');
        closeModals();
        await loadActivities();

    } catch (error) {
        console.error('刪除活動失敗:', error);
        showToast('刪除活動失敗', 'error');
    }
}

// ===== 憑證管理 =====
function addCredentialField(credential = null) {
    const container = document.getElementById('credentialsList');
    const id = credential?.id || `temp-${Date.now()}`;

    const fieldHtml = `
        <div class="credential-item" data-id="${id}">
            <div class="credential-item-info">
                <span class="credential-item-type">${credential ? getCredentialIcon(credential.type) : '📎'} ${credential?.type || 'other'}</span>
                <span>${credential?.name || '未命名'}</span>
            </div>
            <div class="credential-item-actions">
                <button type="button" class="btn btn-secondary btn-edit-credential">編輯</button>
                <button type="button" class="btn btn-danger btn-remove-credential">移除</button>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = fieldHtml;
    container.appendChild(div);

    // 綁定編輯和移除事件
    div.querySelector('.btn-edit-credential').addEventListener('click', () => {
        openCredentialModal(credential);
    });

    div.querySelector('.btn-remove-credential').addEventListener('click', () => {
        div.remove();
        if (credential?.id) {
            deleteCredential(credential.id);
        }
    });
}

function openCredentialModal(credential = null) {
    currentCredentialId = credential?.id || null;
    const form = document.getElementById('credentialForm');
    const modal = document.getElementById('credentialModal');

    form.reset();

    if (credential) {
        document.getElementById('credentialType').value = credential.type;
        document.getElementById('credentialName').value = credential.name;
        document.getElementById('credentialCode').value = credential.code || '';
        document.getElementById('credentialUrl').value = credential.url;
        document.getElementById('credentialNotes').value = credential.notes || '';
    }

    modal.classList.add('show');
}

async function saveCredential(e) {
    e.preventDefault();

    const credentialData = {
        type: document.getElementById('credentialType').value,
        name: document.getElementById('credentialName').value,
        code: document.getElementById('credentialCode').value,
        url: document.getElementById('credentialUrl').value,
        notes: document.getElementById('credentialNotes').value
    };

    if (!credentialData.name || !credentialData.url) {
        showToast('請填寫憑證名稱和連結', 'error');
        return;
    }

    try {
        if (currentCredentialId) {
            // 更新
            const { error } = await supabase
                .from('credentials')
                .update(credentialData)
                .eq('id', currentCredentialId);

            if (error) throw error;

        } else {
            // 創建
            const { error } = await supabase
                .from('credentials')
                .insert([{
                    ...credentialData,
                    activity_id: currentActivityId
                }]);

            if (error) throw error;
        }

        showToast('憑證已保存', 'success');
        closeModals();

    } catch (error) {
        console.error('保存憑證失敗:', error);
        showToast('保存憑證失敗', 'error');
    }
}

async function saveCredentials(activityId) {
    const credentialsFromForm = document.querySelectorAll('#credentialsList .credential-item');

    for (const item of credentialsFromForm) {
        const id = item.dataset.id;
        
        // 如果是臨時 ID，跳過（已在 modal 中保存）
        if (id.startsWith('temp-')) {
            continue;
        }

        // 更新 activity_id
        await supabase
            .from('credentials')
            .update({ activity_id: activityId })
            .eq('id', id);
    }
}

async function deleteCredential(credentialId) {
    try {
        await supabase
            .from('credentials')
            .delete()
            .eq('id', credentialId);

    } catch (error) {
        console.error('刪除憑證失敗:', error);
    }
}

// ===== Google Places 搜尋 =====
async function searchLocations(e) {
    const input = e.target.value;
    if (input.length < 2) {
        document.getElementById('locationSuggestions').classList.remove('show');
        return;
    }

    const request = {
        input: input,
        types: ['establishment', 'geocode']
    };

    placesService.getPlacePredictions(request, (predictions, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK) {
            return;
        }

        const suggestionsDiv = document.getElementById('locationSuggestions');
        suggestionsDiv.innerHTML = predictions.map((p, index) => `
            <div class="suggestion-item" data-index="${index}" 
                 data-place-id="${p.place_id}">
                📍 ${p.main_text}
                <small>${p.secondary_text}</small>
            </div>
        `).join('');

        suggestionsDiv.classList.add('show');

        // 綁定選擇事件
        document.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                selectLocation(item.dataset.placeId);
            });
        });
    });
}

function selectLocation(placeId) {
    const service = new google.maps.places.PlacesService(map);

    service.getDetails({ placeId: placeId }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            document.getElementById('activityLocation').value = place.formatted_address;
            document.getElementById('activityLng').value = place.geometry.location.lng();
            document.getElementById('activityLat').value = place.geometry.location.lat();
            document.getElementById('locationSuggestions').classList.remove('show');
        }
    });
}

// ===== 地圖操作 =====
function updateMapMarkers(activities) {
    // 清除舊標記
    markers.forEach(marker => marker.setMap(null));
    markers = [];

    if (activities.length === 0) return;

    // 創建新標記
    const bounds = new google.maps.LatLngBounds();

    activities.forEach((activity, index) => {
        const marker = new google.maps.Marker({
            position: { lat: activity.lat, lng: activity.lng },
            map: map,
            title: activity.name,
            label: String(index + 1),
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#3b82f6',
                fillOpacity: 0.7,
                strokeColor: '#ffffff',
                strokeWeight: 2
            }
        });

        marker.addListener('click', () => {
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div>
                        <h3>${activity.name}</h3>
                        <p>${activity.start_time} ~ ${activity.end_time}</p>
                        <p>${activity.location}</p>
                    </div>
                `
            });
            infoWindow.open(map, marker);
        });

        markers.push(marker);
        bounds.extend(marker.getPosition());
    });

    // 調整地圖縮放以顯示所有標記
    if (activities.length > 1) {
        map.fitBounds(bounds);
    } else {
        map.setCenter(markers[0].getPosition());
        map.setZoom(15);
    }
}

async function showRoute() {
    if (!currentDayDate) {
        showToast('請先選擇日期', 'error');
        return;
    }

    try {
        const { data: activities, error } = await supabase
            .from('activities')
            .select('*')
            .eq('trip_id', currentTripId)
            .eq('date', currentDayDate)
            .order('start_time', { ascending: true });

        if (error) throw error;

        if (activities.length < 2) {
            showToast('需要至少 2 個活動來顯示路線', 'error');
            return;
        }

        // 構建路線請求
        const waypoints = activities.slice(1, -1).map(a => ({
            location: { lat: a.lat, lng: a.lng },
            stopover: true
        }));

        const request = {
            origin: { lat: activities[0].lat, lng: activities[0].lng },
            destination: { lat: activities[activities.length - 1].lat, lng: activities[activities.length - 1].lng },
            waypoints: waypoints,
            travelMode: 'DRIVING',
            optimizeWaypoints: true
        };

        directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                directionsRenderer.setDirections(result);
                showToast('路線已顯示', 'success');
            } else {
                showToast('無法計算路線', 'error');
            }
        });

    } catch (error) {
        console.error('顯示路線失敗:', error);
        showToast('顯示路線失敗', 'error');
    }
}

function clearRoute() {
    directionsRenderer.setDirections({ routes: [] });
    showToast('路線已清除', 'success');
}

// ===== 實時訂閱 =====
function subscribeToTrips() {
    supabase
        .channel('trips')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, payload => {
            console.log('行程更新:', payload);
            if (currentTripId === payload.new?.id) {
                updateCollaboratorsList(payload.new.collaborators || []);
            }
        })
        .subscribe();
}

function subscribeToActivities() {
    if (!currentTripId) return;

    supabase
        .channel(`activities:${currentTripId}`)
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'activities', filter: `trip_id=eq.${currentTripId}` },
            payload => {
                console.log('活動更新:', payload);
                if (payload.new?.date === currentDayDate) {
                    loadActivities();
                }
            }
        )
        .subscribe();
}

// ===== 工具函數 =====
async function getCurrentUserId() {
    // 簡化版本，實際應該使用真實的用戶認證
    let userId = localStorage.getItem('userId');
    if (!userId) {
        userId = `user_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('userId', userId);
    }
    return userId;
}

function closeModals() {
    document.getElementById('activityModal').classList.remove('show');
    document.getElementById('credentialModal').classList.remove('show');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Modal 外層點擊關閉
window.addEventListener('click', (e) => {
    const activityModal = document.getElementById('activityModal');
    const credentialModal = document.getElementById('credentialModal');

    if (e.target === activityModal) {
        activityModal.classList.remove('show');
    }
    if (e.target === credentialModal) {
        credentialModal.classList.remove('show');
    }
});
