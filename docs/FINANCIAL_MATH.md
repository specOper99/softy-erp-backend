# Financial Math & Precision Documentation

## 1. Overview
Handling financial data requires strict adherence to precision and rounding rules to prevent monetary loss ("salami slicing" attacks or accumulated floating-point errors). This ERP uses **Decimal Arithmetic** principles enforced via utility classes and Database types.

---

## 2. Best Practices

### 2.1 Avoid Floating Point Math
JavaScript's `number` type is an IEEE 754 float, which causes errors like `0.1 + 0.2 = 0.30000000000000004`.
**Rule**: NEVER use standard operators (`+`, `-`, `*`, `/`) for monetary values directly.

### 2.2 Use `MathUtils`
We have implemented a helper class `src/common/utils/math.utils.ts` to handle safe arithmetic.

```typescript
// BAD
const total = price * quantity; 
const balance = wallet.balance - amount;

// GOOD
const total = MathUtils.multiply(price, quantity);
const balance = MathUtils.subtract(wallet.balance, amount);
```

### 2.3 Rounding Strategy
- **Standard**: Round to 2 decimal places using "Round Half Up" (Commercial Rounding).
- **Method**: `MathUtils.round(amount, 2)`
- **Currencies**: 
  - USD/EUR: 2 decimal places.
  - IQD: 0 decimal places (Integers only).

---

## 3. Database Storage

### 3.1 Monetary Columns
Always use `decimal` (or `numeric`) types in PostgreSQL.
```typescript
@Column({ 
  type: 'decimal', 
  precision: 12, // Total digits (up to 99,999,999,999)
  scale: 2       // Decimal points
})
amount: number;
```

### 3.2 Exchange Rates
Exchange rates require higher precision to avoid significant conversion drift.
```typescript
@Column({ 
  type: 'decimal', 
  precision: 12, 
  scale: 6       // 6 decimal places (e.g., 1.234567)
})
exchangeRate: number;
```

---

## 4. Currency Conversion

Formula: `Target Amount = Source Amount * Exchange Rate`

When converting:
1. Fetch latest exchange rate (ensure it is not stale).
2. Perform multiplication using `MathUtils.multiply()`.
3. Round the FINAL result to tenant's base currency precision (usually 2).
4. Do NOT round intermediate steps if chaining calculations.

---

## 5. Validation

- **Positive Values**: Transactions should mostly be positive. Use `@Min(0.01)`.
- **Zero Checks**: Avoid division by zero. `MathUtils` handles this or throws errors.
- **Max Values**: Prevent overflow. Max transaction is capped at `999,999,999.99`.
