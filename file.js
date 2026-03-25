// Supabase 設定
const SUPABASE_URL = 'https://ecpwvddrndodxjdmyqeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-hvKfjTZ5xpfQKUdTbrQpQ_nGXafNlH';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM 元素
const tripForm = document.getElementById('tripForm');
const tripsList = document.getElementById('tripsList');
const toast = document.getElementById('toast');

// 頁面載入時取得所有行程
document.addEventListener('DOMContentLoaded', () => {
    loadTrips();
});

// 表單提交 - 新增行程
tripForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('tripName').value.trim();
    const startDate = document.getElementById('startDate').value || null;
    const endDate = document.getElementById('endDate').value || null;
    
    if (!name) {
        showToast('請輸入行程名稱', 'error');
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('trips')
            .insert([{
                name: name,
                start_date: startDate,
                end_date: endDate
            }])
            .select();
        
        if (error) throw error;
        
        showToast('行程新增成功！', 'success');
        tripForm.reset();
        loadTrips();
        
    } catch (error) {
        console.error('新增失敗:', error);
        showToast('新增失敗: ' + error.message, 'error');
    }
});

// 載入所有行程
async function loadTrips() {
    tripsList.innerHTML = '<div class="loading">載入中...</div>';
    
    try {
        const { data, error } = await supabase
            .from('trips')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        renderTrips(data);
        
    } catch (error) {
        console.error('載入失敗:', error);
        tripsList.innerHTML = '<div class="empty-state"><p>載入失敗，請重新整理頁面</p></div>';
    }
}

// 渲染行程列表
function renderTrips(trips) {
    if (!trips || trips.length === 0) {
        tripsList.innerHTML = `
            <div class="empty-state">
                <div class="icon">✈️</div>
                <p>尚無行程，新增你的第一個旅遊計畫吧！</p>
            </div>
        `;
        return;
    }
    
    tripsList.innerHTML = trips.map(trip => `
        <div class="trip-card" data-id="${trip.id}">
            <div class="trip-info">
                <h3>${escapeHtml(trip.name)}</h3>
                <p class="trip-dates">
                    ${formatDateRange(trip.start_date, trip.end_date)}
                </p>
            </div>
            <button class="btn btn-danger" onclick="deleteTrip('${trip.id}')">
                刪除
            </button>
        </div>
    `).join('');
}

// 刪除行程
async function deleteTrip(id) {
    if (!confirm('確定要刪除這個行程嗎？')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('trips')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showToast('行程已刪除', 'success');
        loadTrips();
        
    } catch (error) {
        console.error('刪除失敗:', error);
        showToast('刪除失敗: ' + error.message, 'error');
    }
}

// 格式化日期範圍
function formatDateRange(startDate, endDate) {
    if (!startDate && !endDate) {
        return '日期未設定';
    }
    
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };
    
    if (startDate && endDate) {
        return `📅 ${formatDate(startDate)} ~ ${formatDate(endDate)}`;
    } else if (startDate) {
        return `📅 ${formatDate(startDate)} 開始`;
    } else {
        return `📅 ~ ${formatDate(endDate)}`;
    }
}

// 防止 XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 顯示 Toast 通知
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
