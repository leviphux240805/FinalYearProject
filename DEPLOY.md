# Deploy Super League Pro lên public URL (Render + Vercel)

Checklist thực hiện theo đúng thứ tự — mỗi bước phụ thuộc bước trước.

## 0. Đẩy code lên GitHub

Claude không push được thay bạn (sandbox không có quyền truy cập GitHub của bạn). Mở PowerShell tại `D:\FinalYearProject` và chạy:

```powershell
git add -A
git commit -m "Chuẩn bị deploy: fix CORS/cookie cross-origin, API_BASE qua env var, render.yaml"
git push origin main
```

## 1. Tạo Redis free (Upstash)

Render không có Redis free, dùng Upstash:

1. Vào https://upstash.com → đăng ký (free) → **Create Database** → chọn region gần Render nhất (Oregon/US-East nếu Render deploy ở Oregon).
2. Copy giá trị **Redis URL** dạng `rediss://default:xxxx@xxxx.upstash.io:6379` — sẽ dùng làm `REDIS_URL` ở bước 2.

## 2. Deploy backend lên Render

1. Vào https://render.com → đăng nhập bằng GitHub → **New +** → **Blueprint**.
2. Chọn repo `FinalYearProject` — Render tự đọc file `render.yaml` ở gốc repo (đã tạo sẵn), tạo Web Service `super-league-backend` + Postgres `super-league-db` free.
3. Sau khi tạo xong, vào **super-league-backend → Environment**, điền các biến còn thiếu (đánh dấu `sync: false` trong render.yaml nên Render không tự điền):
   - `JWT_SECRET` — chạy `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` để sinh, dán vào.
   - `JWT_REFRESH_SECRET` — sinh y như trên nhưng **giá trị khác** với JWT_SECRET.
   - `REDIS_URL` — dán URL Upstash từ bước 1.
   - `FRONTEND_ORIGIN` — để tạm `http://localhost:5173`, sẽ sửa lại ở bước 4 sau khi có URL Vercel thật.
   - `SPORTMONKS_API_TOKEN` / `API_FOOTBALL_KEY` — dán nếu bạn có, không thì để trống (không bắt buộc để app chạy).
4. Save → Render tự build & deploy. Theo dõi log tới khi thấy `🏆 SUPER LEAGUE PRO`.
5. Copy URL Render cấp, dạng `https://super-league-backend.onrender.com`.
6. Mở tab **Shell** trong Render (hoặc dùng "Manual Deploy" logs) để seed dữ liệu lần đầu, chạy lần lượt:
   ```
   npm run seed:teams
   npm run seed:top5-free
   node scripts/backfillLeagueNames.js
   npm run seed:fixtures
   npm run seed:mock-stats
   ```
   *(Bỏ qua nếu bạn định seed từ máy local trỏ DATABASE_URL sang Render Postgres thay vì chạy qua Shell.)*

> Lưu ý: Render free Web Service sẽ "ngủ" sau ~15 phút không có request, request đầu tiên sau đó mất khoảng 30-60s để tỉnh dậy — bình thường, không phải lỗi.

## 3. Deploy frontend lên Vercel

1. Vào https://vercel.com → đăng nhập GitHub → **Add New → Project** → chọn repo `FinalYearProject`.
2. **Root Directory**: chọn `super-league-fantasy` (không phải gốc repo).
3. Framework Preset: Vercel tự nhận Vite — giữ nguyên Build Command `npm run build`, Output Directory `dist`.
4. **Environment Variables** → thêm `VITE_API_BASE` = URL Render ở bước 2.6 (ví dụ `https://super-league-backend.onrender.com`, **không** có `/api` ở cuối).
5. Deploy → Vercel cấp URL dạng `https://super-league-fantasy.vercel.app`.

## 4. Nối 2 chiều: cập nhật FRONTEND_ORIGIN trên Render

Quay lại Render → `super-league-backend` → Environment → sửa `FRONTEND_ORIGIN` thành đúng URL Vercel vừa nhận được (bước 3.5), ví dụ:
```
FRONTEND_ORIGIN=https://super-league-fantasy.vercel.app
```
Save → Render tự redeploy (vài chục giây). Nếu sau này có thêm domain khác (vd Vercel preview URL), nối bằng dấu phẩy: `https://a.vercel.app,https://b.vercel.app`.

## 5. Kiểm tra

- `https://super-league-backend.onrender.com/health` → phải trả `{"status":"ok",...}`.
- Mở `https://super-league-fantasy.vercel.app` → đăng ký tài khoản mới, xây đội hình, thử mua/bán cầu thủ.
- Nếu login xong reload trang bị văng ra ngoài: kiểm tra lại `FRONTEND_ORIGIN` đúng URL Vercel (không có dấu `/` cuối) và cookie hoạt động qua HTTPS (`secure: true` chỉ chạy khi cả 2 domain đều https, Render/Vercel mặc định đều https nên ổn).

---

**Những gì Claude đã sửa sẵn trong code để việc deploy này chạy được** (không cần bạn tự sửa nữa):
- `services/tokenService.js`: cookie refresh-token đổi `sameSite: 'strict'` → `'none'` (chỉ khi `NODE_ENV=production`) — bắt buộc vì frontend/backend giờ khác domain.
- `server.js`: thêm `app.set('trust proxy', 1)` (Render đứng sau reverse proxy) và endpoint `GET /health`.
- `package.json`: thêm script `start`, `postinstall` (prisma generate), `build` (prisma generate + migrate deploy).
- `render.yaml`: Blueprint tự tạo Web Service + Postgres.
- Frontend: gom toàn bộ URL `http://localhost:3000` rải rác (6 file) về một biến `API_BASE`/`API_ORIGIN` trong `store.js`, đọc từ `VITE_API_BASE` — set biến này trên Vercel là đủ, không cần sửa code nữa.
