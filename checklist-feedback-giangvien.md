# Checklist phản hồi của giảng viên — Demo & Report

*Tổng hợp từ buổi review, dùng để mang theo trao đổi trực tiếp buổi học thứ 6.*

## A. Demo gameplay (UI/UX)

1. **Chi tiết cầu thủ khi chọn** — cần bảng chi tiết thông tin cầu thủ: điểm số từng vòng, số trận thi đấu, số phút thi đấu... (hiện chưa có).
2. **Danh sách trận đấu theo vòng** — từng trận đấu của vòng đang chọn phải luôn hiển thị, để người dùng chọn đúng cầu thủ dựa trên trận đấu đó.
3. **(Quan trọng) Màu áo & giới hạn cùng CLB** — phải hiển thị đúng màu áo của từng cầu thủ theo CLB, và cảnh báo/chặn khi số cầu thủ cùng 1 đội vượt quá quy định.
4. **Băng ghế dự bị & ưu tiên thay người** — phần ghế dự bị, thứ tự ưu tiên thay cầu thủ, và thay đổi chiến thuật khi thay người: chưa thấy thể hiện trong demo.
5. **Con số hiển thị trên từng cầu thủ** — đang hiện 4-6 chữ số không rõ nghĩa là gì (với 15 cầu thủ hiển thị cùng lúc); cần làm rõ ý nghĩa hoặc bỏ nếu không cần thiết.
6. **Phó đội trưởng (vice-captain)** — chưa có cơ chế phó đội trưởng để tự động thay đội trưởng (ví dụ khi đội trưởng không đá chính).
7. **So sánh cầu thủ chưa hữu ích** — cần so sánh **tổng điểm dự đoán theo từng vòng** dựa trên dự đoán kết quả trận đấu, chứ không phải kiểu so sánh hiện tại (không giúp người dùng ra quyết định chọn ai).

**Câu hỏi mở (từ bạn học + giảng viên), cần chuẩn bị câu trả lời:**
- Ý nghĩa chính xác của các con số hiển thị trên mỗi cầu thủ (mục A5) là gì?
- Phần **tính điểm** và phần **kinh tế ảo** (ngân sách, giá cầu thủ...) — mức độ phức tạp thực tế ra sao, và đóng góp/tự thiết kế của bạn trong đó là gì? (Giảng viên hỏi thẳng: *"phần tính điểm và phần kinh tế phức tạp đến mức nào? em đóng góp gì trong đó?"*)

## B. Report — hành văn & cấu trúc

1. Thêm đầy đủ các phần đầu report (cover page, v.v. — hiện thiếu).
2. Trang 27: chú thích **hình vẽ** phải đặt **dưới hình** (chỉ chú thích **bảng** mới để trên bảng).
3. Bỏ các thuật ngữ kiểu "black box", "grey box"... (giảng viên đã comment từ lần trước, vẫn còn sót).
4. Bỏ câu thừa dưới hình: *"System Context Diagram, carried over from the project's earlier design pass"*.
5. Bỏ ghi chú thừa: *"Note on this figure (flagged, not corrected)"* và đoạn giải thích meta đi kèm (đoạn nói về Sportmonks label / Admin actor chưa implement) — đây là dạng "note-to-self" không nên nằm trong report chính thức.
6. **Nguyên tắc chung**: nếu kiến trúc hệ thống hoặc tương tác với bên ngoài có thay đổi, phải **cập nhật lại hình vẽ** cho khớp, rồi mới viết đoạn văn giải thích hình bên dưới — không giải thích bằng cách chú thích rằng hình bị lỗi thời.
7. ⇒ Cần rà soát **toàn bộ report từ đầu đến cuối**, bỏ hết các dòng thừa/vô nghĩa tương tự các mục trên.

## C. Report — nội dung kỹ thuật đặt sai chỗ / thiết kế CSDL

1. **Use Case chứa chi tiết implementation** — đoạn mô tả kỹ thuật (khóa row bằng `SELECT ... FOR UPDATE` trong Prisma transaction, công thức `netBudget`, `shortfall`, ngưỡng phạt −4 điểm...) đang nằm trong phần Use Case. Giảng viên đã nói vấn đề này từ lần trước.
   - **Nguyên tắc**: Use Case chỉ mô tả những gì **người dùng quan sát được từ bên ngoài** và **trạng thái hệ thống sau khi thực hiện** (ví dụ: "một bản ghi giao dịch được lưu vào CSDL"), không mô tả cách hiện thực bên trong.
   - Chi tiết kỹ thuật như trên phải chuyển sang phần **Design** và **Implementation**.
2. **Thiết kế CSDL quá đơn giản** — chỉ 6 bảng, ít thuộc tính. Cụ thể:
   - Bảng **Transaction** chưa đủ thông tin để **truy vết** một giao dịch phát sinh từ việc chuyển nhượng/lập đội của **squad nào, gameweek nào** — vẫn là vấn đề đã comment từ lần trước, chưa khắc phục.
   - Chưa trình bày rõ: dữ liệu từ API bên ngoài (Sportmonks/API-Football...) được **xử lý và lưu vào CSDL như thế nào** — "dữ liệu từ API không thể chạy thẳng vào CSDL", cần mô tả bước trung gian.
3. Đoạn giải thích hiện tại về "truy vết" (lineage/traceability) trong report **chưa rõ và chưa thỏa đáng** theo đánh giá của giảng viên.

**Hành động bắt buộc**: giảng viên yêu cầu đến lớp **buổi học thứ 6 tuần này** để trao đổi trực tiếp về đúng 2 điểm C.2 và C.3 (thiết kế bảng Transaction + luồng dữ liệu API → CSDL) — nên chuẩn bị trước phương án đề xuất (ví dụ: thêm cột `squadId`/`gameweek` vào Transaction, hoặc bảng trung gian ghi log import từ API) để buổi thảo luận hiệu quả hơn.

---

### Tóm tắt độ ưu tiên trước buổi họp
| Việc cần chuẩn bị | Loại |
|---|---|
| Trả lời được câu hỏi "con số trên cầu thủ là gì" | Trả lời miệng |
| Trả lời được mức độ phức tạp/đóng góp phần tính điểm + kinh tế | Trả lời miệng |
| Có sẵn ý tưởng thiết kế lại bảng Transaction (truy vết theo squad/gameweek) | Chuẩn bị trước khi gặp cô |
| Có sẵn giải thích luồng API → xử lý → lưu CSDL | Chuẩn bị trước khi gặp cô |
| Mục A (7 điểm demo) + Mục B (7 điểm report) | Có thể tự sửa, không cần chờ gặp cô |
