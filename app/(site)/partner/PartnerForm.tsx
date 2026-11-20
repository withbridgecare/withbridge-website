"use client"

/**
 * 제휴 문의 폼 (예전 partner.html 의 인라인 <script> 를 React 로 옮김).
 * 입력 검사 → partner_inquiries 저장. 화면 모양(클래스)은 기존 그대로입니다.
 */
import { useRef, useState } from "react"
import { getSupabase } from "@/lib/supabase/client"
import {
	formatPhone,
	PARTNER_ORG_TYPES,
	PARTNER_RULES,
	submitPartnerInquiry,
	type PartnerOrgType,
} from "@/lib/api/partners"

type Field = keyof typeof PARTNER_RULES
const FIELDS = Object.keys(PARTNER_RULES) as Field[]
const ORG_TYPE_LABEL: Record<PartnerOrgType, string> = {
	요양원: "요양원",
	주야간보호센터: "주야간보호센터",
	복지관: "복지관",
	의료기관: "종합병원 · 의료기관",
	기타: "기타",
}

/** 필수 입력 표시(*) */
function Req() {
	return (
		<span className="req" aria-hidden="true">
			*
		</span>
	)
}

export function PartnerForm() {
	const formRef = useRef<HTMLFormElement>(null)
	const [errors, setErrors] = useState<
		Partial<Record<Field | "org_type", string>>
	>({})
	const [status, setStatus] = useState<{
		kind: "" | "ok" | "fail"
		text: string
	}>({ kind: "", text: "" })
	const [sending, setSending] = useState(false)

	const validate = (name: Field, value: string) => {
		const r = PARTNER_RULES[name](value)
		setErrors((e) => ({ ...e, [name]: r === true ? "" : r }))
		return r === true
	}

	const errProps = (name: Field) => ({
		"aria-invalid": errors[name] ? true : undefined,
		"aria-describedby": errors[name] ? name + "-err" : undefined,
		onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
			validate(name, e.target.value),
	})

	const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		const form = e.currentTarget
		const el = form.elements as HTMLFormControlsCollection &
			Record<string, HTMLInputElement>
		setStatus({ kind: "", text: "" })
		if (el.website.value) return // 봇 차단(honeypot)

		let firstBad: HTMLElement | null = null
		for (const n of FIELDS) {
			if (!validate(n, el[n].value) && !firstBad) firstBad = el[n]
		}
		const type = form.querySelector<HTMLInputElement>(
			'input[name="org_type"]:checked',
		)
		setErrors((x) => ({
			...x,
			org_type: type ? "" : "제휴 유형을 선택해 주세요.",
		}))
		if (!type && !firstBad)
			firstBad = form.querySelector<HTMLInputElement>('input[name="org_type"]')
		if (!el.agree.checked) {
			setStatus({ kind: "fail", text: "개인정보 수집·이용에 동의해 주세요." })
			if (!firstBad) firstBad = el.agree
		}
		if (firstBad) {
			firstBad.focus()
			return
		}

		setSending(true)
		try {
			await submitPartnerInquiry(getSupabase(), {
				org_name: el.org_name.value.trim(),
				contact_name: el.contact_name.value.trim(),
				phone: el.phone.value.trim(),
				email: el.email.value.trim().toLowerCase(),
				org_type: type!.value as PartnerOrgType,
				message: el.message.value.trim(),
			})
			form.reset()
			setStatus({
				kind: "ok",
				text: "문의가 정상적으로 접수되었습니다. 1영업일 내 담당 매니저가 연락드리겠습니다.",
			})
		} catch (err) {
			console.error("[partner_inquiries]", err)
			setStatus({
				kind: "fail",
				text: "전송 중 문제가 발생했습니다. 잠시 후 다시 시도하시거나 상단 카카오 문의하기로 연락해 주세요.",
			})
		} finally {
			setSending(false)
		}
	}

	return (
		<form
			className="inq-form"
			id="partnerForm"
			noValidate
			ref={formRef}
			onSubmit={onSubmit}
		>
			<div className="field">
				<label htmlFor="org_name">
					기관 · 기업명 <Req />
				</label>{" "}
				<input
					id="org_name"
					name="org_name"
					type="text"
					autoComplete="organization"
					placeholder="예) 위드케어 요양원"
					required
					maxLength={100}
					{...errProps("org_name")}
				/>{" "}
				<span className="err" id="org_name-err">
					{errors.org_name}
				</span>
			</div>
			<div className="field">
				<label htmlFor="contact_name">
					담당자 성함 <Req />
				</label>{" "}
				<input
					id="contact_name"
					name="contact_name"
					type="text"
					autoComplete="name"
					placeholder="홍길동 (직함)"
					required
					maxLength={50}
					{...errProps("contact_name")}
				/>{" "}
				<span className="err" id="contact_name-err">
					{errors.contact_name}
				</span>
			</div>
			<div className="field">
				<label htmlFor="phone">
					연락처 <Req />
				</label>{" "}
				<input
					id="phone"
					name="phone"
					type="tel"
					inputMode="tel"
					autoComplete="tel"
					placeholder="010-0000-0000"
					required
					maxLength={20}
					onInput={(e) => {
						e.currentTarget.value = formatPhone(e.currentTarget.value)
					}}
					{...errProps("phone")}
				/>{" "}
				<span className="err" id="phone-err">
					{errors.phone}
				</span>
			</div>
			<div className="field">
				<label htmlFor="email">
					이메일 <Req />
				</label>{" "}
				<input
					id="email"
					name="email"
					type="email"
					autoComplete="email"
					placeholder="name@company.com"
					required
					maxLength={120}
					{...errProps("email")}
				/>{" "}
				<span className="err" id="email-err">
					{errors.email}
				</span>
			</div>
			<fieldset className="field full">
				<legend>
					제휴 유형 <Req />
				</legend>
				<div className="types" style={{ marginTop: "8px" }}>
					{PARTNER_ORG_TYPES.map((t, i) => (
						<span key={t} style={{ display: "contents" }}>
							{i > 0 && " "}
							<label className="type">
								<input
									type="radio"
									name="org_type"
									value={t}
									required={i === 0}
								/>
								<span>{ORG_TYPE_LABEL[t]}</span>
							</label>
						</span>
					))}
				</div>
				<span className="err" id="org_type-err">
					{errors.org_type}
				</span>
			</fieldset>
			<div className="field full">
				<label htmlFor="message">
					문의 내용 <Req />
				</label>{" "}
				<textarea
					id="message"
					name="message"
					placeholder="예상 이용 인원, 월 이용 빈도, 지역, 필요한 서비스 등을 알려주시면 더 정확한 제안이 가능합니다."
					required
					maxLength={2000}
					{...errProps("message")}
				/>{" "}
				<span className="err" id="message-err">
					{errors.message}
				</span>
			</div>
			<div className="hp" aria-hidden="true">
				<label htmlFor="website">웹사이트</label>
				<input
					id="website"
					name="website"
					type="text"
					tabIndex={-1}
					autoComplete="off"
				/>
			</div>
			<label className="consent">
				<input type="checkbox" id="agree" name="agree" required />{" "}
				<span>
					[필수] 제휴 상담을 위한{" "}
					<a href="/privacy" target="_blank" rel="noopener">
						개인정보 수집·이용
					</a>
					에 동의합니다. 수집 항목: 기관명, 담당자명, 연락처, 이메일 · 보유
					기간: 상담 종료 후 1년
				</span>
			</label>
			<div
				className={"status" + (status.kind ? " " + status.kind : "")}
				id="formStatus"
				role="status"
				aria-live="polite"
			>
				{status.text}
			</div>
			<div className="submit-row">
				<button
					type="submit"
					className={"btn" + (sending ? " loading" : "")}
					id="submitBtn"
					disabled={sending}
				>
					<span className="spinner" aria-hidden="true"></span>
					<span className="label">
						{sending ? "전송 중…" : "제휴 문의 보내기"}
					</span>
				</button>{" "}
				<small>평균 1영업일 내 회신드립니다.</small>
			</div>
		</form>
	)
}
